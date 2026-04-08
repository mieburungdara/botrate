<?php

namespace App\Services\Telegram\Middleware;

use App\Models\Blacklist;
use App\Models\User;
use App\Services\Telegram\TelegramBot;
use Illuminate\Support\Facades\Cache;

class BlacklistMiddleware
{
    protected TelegramBot $bot;

    public function __construct(TelegramBot $bot)
    {
        $this->bot = $bot;
    }

    /**
     * Handle the update. Returns true if allowed, false if blocked.
     */
    public function handle(array $update): bool
    {
        $userId = $this->getUserId($update);
        if (!$userId) {
            return true; // No user ID, allow
        }

        // Admin is immune
        if ($userId == config('telegram.admin_user_id')) {
            return true;
        }

        // Check cache first
        $cacheKey = "blacklist:{$userId}";
        $isBlacklisted = Cache::remember($cacheKey, 300, function () use ($userId) {
            return Blacklist::where('user_id', $userId)->exists();
        });

        if ($isBlacklisted) {
            // Get reason
            $blacklist = Blacklist::where('user_id', $userId)->first();
            $reason = $blacklist?->reason ?? 'Tidak ada alasan yang diberikan.';

            $this->bot->sendMessage($userId, "🚫 <b>Akses Ditolak</b>\n\nAnda telah diblokir dari menggunakan bot ini.\n\nAlasan: {$reason}");

            return false;
        }

        return true;
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

        $inlineQuery = $update['inline_query'] ?? null;
        if ($inlineQuery) {
            return $inlineQuery['from']['id'] ?? null;
        }

        return null;
    }
}