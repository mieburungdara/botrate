<?php

namespace App\Services\Telegram\Middleware;

use App\Models\User;
use App\Services\Telegram\TelegramBot;
use Illuminate\Support\Facades\Log;

class UserMiddleware
{
    protected TelegramBot $bot;

    public function __construct(TelegramBot $bot)
    {
        $this->bot = $bot;
    }

    /**
     * Handle the update. Registers or updates user.
     * Returns the User model or null.
     */
    public function handle(array $update): ?User
    {
        $from = $this->getFrom($update);
        if (!$from) {
            return null;
        }

        $userId = $from['id'];
        $username = $from['username'] ?? null;
        $firstName = $from['first_name'] ?? '';
        $lastName = $from['last_name'] ?? null;

        // Check if user exists
        $user = User::find($userId);

        if (!$user) {
            // New user - generate anonymous ID
            $anonymousId = TelegramBot::generateAnonymousId();

            $user = User::create([
                'user_id' => $userId,
                'username' => $username,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'anonymous_id' => $anonymousId,
                'last_active' => now(),
            ]);

            Log::info('New user registered', [
                'user_id' => $userId,
                'username' => $username,
                'anonymous_id' => $anonymousId,
            ]);
        } else {
            // Existing user - update info
            $user->update([
                'username' => $username,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'last_active' => now(),
            ]);
        }

        return $user;
    }

    /**
     * Extract user data from update.
     */
    protected function getFrom(array $update): ?array
    {
        $message = $update['message'] ?? $update['edited_message'] ?? null;
        if ($message) {
            return $message['from'] ?? null;
        }

        $callbackQuery = $update['callback_query'] ?? null;
        if ($callbackQuery) {
            return $callbackQuery['from'] ?? null;
        }

        return null;
    }
}