<?php

namespace App\Http\Controllers;

use App\Models\Album;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WebAppController extends Controller
{
    /**
     * Get user stats and albums.
     */
    public function stats(Request $request)
    {
        $user = $this->validateTelegramInitData($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $albums = Album::where('user_id', $user->user_id)
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get(['id', 'status', 'caption', 'download_count', 'created_at', 'approved_at', 'rejected_at', 'reject_reason']);

        return response()->json([
            'user' => [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'anonymous_id' => $user->anonymous_id,
                'album_count' => $user->album_count,
                'download_count' => $user->download_count,
                'is_public' => $user->is_public,
            ],
            'albums' => $albums,
        ]);
    }

    /**
     * Get user profile.
     */
    public function profile(Request $request)
    {
        $user = $this->validateTelegramInitData($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        return response()->json([
            'user' => [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'full_name' => $user->full_name,
                'anonymous_id' => $user->anonymous_id,
                'is_public' => $user->is_public,
                'album_count' => $user->album_count,
                'download_count' => $user->download_count,
                'created_at' => $user->created_at,
                'last_active' => $user->last_active,
            ],
        ]);
    }

    /**
     * Toggle public/private mode.
     */
    public function togglePublic(Request $request)
    {
        $user = $this->validateTelegramInitData($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $user->update(['is_public' => !$user->is_public]);

        return response()->json([
            'success' => true,
            'is_public' => $user->is_public,
        ]);
    }

    /**
     * Get album detail with share link.
     */
    public function albumDetail(Request $request, int $id)
    {
        $user = $this->validateTelegramInitData($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $album = Album::where('user_id', $user->user_id)
            ->where('id', $id)
            ->first();

        if (!$album) {
            return response()->json(['error' => 'Album not found'], 404);
        }

        $shareLink = null;
        if ($album->status === 'approved' && $album->unique_token) {
            $botUsername = config('telegram.bot_username');
            $shareLink = "https://t.me/{$botUsername}?start={$album->unique_token}";
        }

        return response()->json([
            'album' => [
                'id' => $album->id,
                'status' => $album->status,
                'caption' => $album->caption,
                'download_count' => $album->download_count,
                'created_at' => $album->created_at,
                'approved_at' => $album->approved_at,
                'rejected_at' => $album->rejected_at,
                'reject_reason' => $album->reject_reason,
                'share_link' => $shareLink,
            ],
        ]);
    }

    /**
     * Get leaderboard.
     */
    public function leaderboard(Request $request)
    {
        $user = $this->validateTelegramInitData($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $leaders = User::where('album_count', '>', 0)
            ->orderBy('album_count', 'desc')
            ->limit(20)
            ->get(['anonymous_id', 'album_count', 'download_count']);

        return response()->json([
            'leaderboard' => $leaders,
        ]);
    }

    /**
     * Validate Telegram WebApp init data with HMAC-SHA256.
     */
    protected function validateTelegramInitData(Request $request): ?User
    {
        $initData = $request->header('X-Telegram-Init-Data');
        if (!$initData) {
            return null;
        }

        // Parse init data
        parse_str($initData, $data);

        // Validate hash
        if (!$this->validateHash($data)) {
            return null;
        }

        if (!isset($data['user'])) {
            return null;
        }

        $userData = json_decode($data['user'], true);
        if (!$userData || !isset($userData['id'])) {
            return null;
        }

        // Find or create user
        $user = User::find($userData['id']);
        if (!$user) {
            $anonymousId = \App\Services\Telegram\TelegramBot::generateAnonymousId();
            $user = User::create([
                'user_id' => $userData['id'],
                'username' => $userData['username'] ?? null,
                'first_name' => $userData['first_name'] ?? '',
                'last_name' => $userData['last_name'] ?? null,
                'anonymous_id' => $anonymousId,
                'last_active' => now(),
            ]);
        } else {
            $user->update([
                'username' => $userData['username'] ?? $user->username,
                'first_name' => $userData['first_name'] ?? $user->first_name,
                'last_name' => $userData['last_name'] ?? $user->last_name,
                'last_active' => now(),
            ]);
        }

        return $user;
    }

    /**
     * Validate HMAC-SHA256 hash from Telegram initData.
     */
    protected function validateHash(array $data): bool
    {
        if (!isset($data['hash'])) {
            return false;
        }

        $hash = $data['hash'];
        unset($data['hash']);

        // Sort data alphabetically by key
        ksort($data);

        // Build data check string
        $dataCheckString = http_build_query($data, '', '&', PHP_QUERY_RFC3986);

        // Create secret key: HMAC-SHA256(bot_token, "WebAppData")
        $secretKey = hash_hmac('sha256', config('telegram.bot_token'), 'WebAppData', true);

        // Calculate hash
        $calculatedHash = hash_hmac('sha256', $dataCheckString, $secretKey);

        // Compare hashes
        return hash_equals($calculatedHash, $hash);
    }
}