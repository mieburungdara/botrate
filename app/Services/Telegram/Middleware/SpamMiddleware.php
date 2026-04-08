<?php

namespace App\Services\Telegram\Middleware;

use App\Services\Telegram\TelegramBot;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Redis;

class SpamMiddleware
{
    protected TelegramBot $bot;
    protected int $maxMessagesPerMinute;
    protected int $minIntervalMs;

    public function __construct(TelegramBot $bot)
    {
        $this->bot = $bot;
        $this->maxMessagesPerMinute = config('botrate.rate_limit.max_messages_per_minute', 40);
        $this->minIntervalMs = config('botrate.rate_limit.min_interval_ms', 1000);
    }

    /**
     * Handle the update. Returns true if not spam, false if spam.
     */
    public function handle(array $update): bool
    {
        $userId = $this->getUserId($update);
        if (!$userId) {
            return true;
        }

        // Admin is immune
        if ($userId == config('telegram.admin_user_id')) {
            return true;
        }

        $now = time();
        $isAlbum = $this->isMediaGroup($update);

        // Check interval (minimum time between messages)
        $intervalKey = "spam_interval:{$userId}";
        $lastMsgTime = Cache::get($intervalKey, 0);

        if (!$isAlbum && ($now - $lastMsgTime) * 1000 < $this->minIntervalMs) {
            // Too fast, silently drop
            return false;
        }

        // Update interval
        Cache::put($intervalKey, $now, config('botrate.spam.interval_cache_ttl', 5));

        // Check rate limit (messages per minute)
        $rateKey = "spam_rate:{$userId}";
        $msgCount = Cache::get($rateKey, 0);

        if ($msgCount >= $this->maxMessagesPerMinute) {
            $this->bot->sendMessage($userId, "⚠️ Anda terlalu cepat mengirim pesan. Harap tunggu sebentar.");
            return false;
        }

        // Increment counter
        if ($msgCount === 0) {
            Cache::put($rateKey, 1, config('botrate.spam.cache_ttl', 60));
        } else {
            Cache::increment($rateKey);
        }

        return true;
    }

    /**
     * Check if update is part of a media group (album).
     */
    protected function isMediaGroup(array $update): bool
    {
        $message = $update['message'] ?? $update['edited_message'] ?? null;
        return isset($message['media_group_id']);
    }

    /**
     * Extract user ID from update.
     */
    protected function getUserId(array $update): ?int
    {
        $message = $update['message'] ?? $update['edited_message'] ?? null;
        if ($message) {
            return $message['from']['id'] ?? null;
        }

        $callbackQuery = $update['callback_query'] ?? null;
        if ($callbackQuery) {
            return $callbackQuery['from']['id'] ?? null;
        }

        return null;
    }
}