<?php

namespace App\Http\Controllers;

use App\Models\Album;
use App\Services\Telegram\Handlers\AlbumHandler;
use App\Services\Telegram\Handlers\CommandHandler;
use App\Services\Telegram\Handlers\DonationHandler;
use App\Services\Telegram\Handlers\DistributionHandler;
use App\Services\Telegram\Handlers\ModerationHandler;
use App\Services\Telegram\Middleware\BlacklistMiddleware;
use App\Services\Telegram\Middleware\SpamMiddleware;
use App\Services\Telegram\Middleware\UserMiddleware;
use App\Services\Telegram\TelegramBot;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class TelegramWebhookController extends Controller
{
    protected TelegramBot $bot;
    protected BlacklistMiddleware $blacklistMiddleware;
    protected SpamMiddleware $spamMiddleware;
    protected UserMiddleware $userMiddleware;
    protected AlbumHandler $albumHandler;
    protected ModerationHandler $moderationHandler;
    protected DistributionHandler $distributionHandler;
    protected DonationHandler $donationHandler;

    public function __construct(
        TelegramBot $bot,
        BlacklistMiddleware $blacklistMiddleware,
        SpamMiddleware $spamMiddleware,
        UserMiddleware $userMiddleware,
        AlbumHandler $albumHandler,
        ModerationHandler $moderationHandler,
        DistributionHandler $distributionHandler,
        DonationHandler $donationHandler
    ) {
        $this->bot = $bot;
        $this->blacklistMiddleware = $blacklistMiddleware;
        $this->spamMiddleware = $spamMiddleware;
        $this->userMiddleware = $userMiddleware;
        $this->albumHandler = $albumHandler;
        $this->moderationHandler = $moderationHandler;
        $this->distributionHandler = $distributionHandler;
        $this->donationHandler = $donationHandler;
    }

    /**
     * Handle webhook from Telegram.
     */
    public function handle(Request $request)
    {
        $update = $request->all();

        // Validate update has update_id
        if (!isset($update['update_id'])) {
            Log::warning('Invalid webhook payload', ['update' => $update]);
            return response('Invalid payload', 400);
        }

        // Log for audit
        $startTime = microtime(true);
        Log::info('[Audit] ' . date('Y-m-d H:i:s') . ' | webhook | ' . ($update['update_id'] ?? 'unknown'));

        try {
            // Check blacklist
            if (!$this->blacklistMiddleware->handle($update)) {
                return response('OK', 200);
            }

            // Check spam
            if (!$this->spamMiddleware->handle($update)) {
                return response('OK', 200);
            }

            // Register/update user
            $user = $this->userMiddleware->handle($update);

            // Route the update
            $this->routeUpdate($update, $user);

            // Log duration
            $duration = round((microtime(true) - $startTime) * 1000, 2);
            if ($duration > 2000) {
                Log::warning('[Audit] Slow handler: ' . $duration . 'ms');
            }

            return response('OK', 200);
        } catch (\Exception $e) {
            // Sensor token in error message
            $safeError = preg_replace(
                '/[0-9]{8,10}:[a-zA-Z0-9_-]{35}/',
                '[REDACTED_TOKEN]',
                $e->getMessage()
            );

            Log::error('Webhook Error', [
                'error' => $safeError,
                'trace' => $e->getTraceAsString(),
            ]);

            return response('Error', 500);
        }
    }

    /**
     * Route update to appropriate handler.
     */
    protected function routeUpdate(array $update, $user): void
    {
        // Handle message
        $message = $update['message'] ?? $update['edited_message'] ?? null;
        if ($message) {
            $this->handleMessage($update, $message, $user);
            return;
        }

        // Handle callback query
        $callbackQuery = $update['callback_query'] ?? null;
        if ($callbackQuery) {
            $this->handleCallbackQuery($update, $callbackQuery);
            return;
        }
    }

    /**
     * Handle incoming message.
     */
    protected function handleMessage(array $update, array $message, $user): void
    {
        // Check for /start command
        if (isset($message['text']) && str_starts_with($message['text'], '/start')) {
            $this->handleStartCommand($update, $message, $user);
            return;
        }

        // Check for media
        if (isset($message['photo']) || isset($message['video']) || isset($message['document'])) {
            $this->albumHandler->handle($update, $user);
            return;
        }

        // Check for custom reject reason (admin typing text after clicking custom reject)
        if (isset($message['text'])) {
            $cacheKey = "reject_custom:pending";
            if (\Illuminate\Support\Facades\Cache::has($cacheKey)) {
                $this->moderationHandler->handleCustomReasonText($user->user_id, $message['text']);
                \Illuminate\Support\Facades\Cache::forget($cacheKey);
                return;
            }

            // Check for custom donation amount
            $cacheKey = "donate_custom:pending";
            if (\Illuminate\Support\Facades\Cache::has($cacheKey)) {
                $data = \Illuminate\Support\Facades\Cache::get($cacheKey);
                if ($data && isset($data['creator_user_id'], $data['album_token'])) {
                    $this->donationHandler->handleDonationText($user->user_id, $message['text'], $data['album_token']);
                    \Illuminate\Support\Facades\Cache::forget($cacheKey);
                    return;
                }
            }
        }
    }

    /**
     * Handle /start command.
     */
    protected function handleStartCommand(array $update, array $message, $user): void
    {
        $text = $message['text'] ?? '';
        $parts = explode(' ', $text, 2);
        $payload = $parts[1] ?? null;

        if ($payload && preg_match('/^[a-f0-9]{32}$/', $payload)) {
            $this->distributionHandler->handleStartWithToken($payload, $user->user_id, $message['from']);
        } else {
            $this->distributionHandler->handleStart($user->user_id);
        }
    }

    /**
     * Handle callback query.
     */
    protected function handleCallbackQuery(array $update, array $callbackQuery): void
    {
        $data = $callbackQuery['data'] ?? '';

        // Parse callback data
        if (preg_match('/^approve_(\d+)$/', $data, $matches)) {
            $this->moderationHandler->handleApprove((int) $matches[1], $callbackQuery);
        } elseif (preg_match('/^reject_(\d+)$/', $data, $matches)) {
            $this->moderationHandler->handleReject((int) $matches[1], $callbackQuery);
        } elseif (preg_match('/^reject_confirm_(\d+)_(.+)$/', $data, $matches)) {
            $this->moderationHandler->handleRejectWithReason((int) $matches[1], $matches[2], $callbackQuery);
        } elseif (preg_match('/^reject_custom_(\d+)$/', $data, $matches)) {
            $this->moderationHandler->handleRejectCustom((int) $matches[1], $callbackQuery);
        } elseif (preg_match('/^donate_(\d+)_(\d+)_([a-f0-9]{32})$/', $data, $matches)) {
            // donate_{creatorUserId}_{amount}_{albumToken}
            $creatorUserId = (int) $matches[1];
            $amount = (int) $matches[2];
            $albumToken = $matches[3];
            $this->donationHandler->handleDonationPreset($callbackQuery, $creatorUserId, $amount, $albumToken);
        } elseif (preg_match('/^donate_custom_(\d+)_([a-f0-9]{32})$/', $data, $matches)) {
            // donate_custom_{creatorUserId}_{albumToken}
            $creatorUserId = (int) $matches[1];
            $albumToken = $matches[2];
            // Set pending state for custom amount
            \Illuminate\Support\Facades\Cache::put('donate_custom:pending', [
                'creator_user_id' => $creatorUserId,
                'album_token' => $albumToken,
            ], 300);
            $this->bot->answerCallbackQuery($callbackQuery['id'], [
                'text' => 'Ketik nominal donasi (min RP 1.000)',
                'show_alert' => false,
            ]);
        } elseif ($data === 'noop') {
            // No-op callback
            $this->bot->answerCallbackQuery($callbackQuery['id']);
        }
    }
}