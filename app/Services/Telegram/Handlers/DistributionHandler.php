<?php

namespace App\Services\Telegram\Handlers;

use App\Models\Album;
use App\Models\Download;
use App\Models\User;
use App\Services\Telegram\TelegramBot;

class DistributionHandler
{
    protected TelegramBot $bot;

    public function __construct(TelegramBot $bot)
    {
        $this->bot = $bot;
    }

    /**
     * Handle /start with token (deep link).
     */
    public function handleStartWithToken(string $token, int $userId, array $from): void
    {
        // Validate token format (32-char hex)
        if (!preg_match('/^[a-f0-9]{32}$/', $token)) {
            $this->bot->sendMessage($userId, "❌ Link tidak valid atau media sudah dihapus.");
            return;
        }

        // Find approved album
        $album = Album::where('unique_token', $token)
            ->where('status', Album::STATUS_APPROVED)
            ->first();

        if (!$album) {
            $this->bot->sendMessage($userId, "❌ Link tidak valid atau media sudah dihapus.");
            return;
        }

        // Send media to user
        $this->sendMediaToUser($userId, $album);

        // Update download stats
        $this->recordDownload($album, $userId);
    }

    /**
     * Handle /start without token (greeting).
     */
    public function handleStart(int $userId): void
    {
        $this->bot->sendMessage(
            $userId,
            "👋 Halo! Kirimkan media (foto/video/file) ke sini untuk kami moderasi dan publikasikan."
        );
    }

    /**
     * Send media to user.
     */
    protected function sendMediaToUser(int $userId, Album $album): void
    {
        $mediaItems = $album->getMediaItems();
        $visualMedia = $album->getVisualMedia();
        $documents = $album->getDocuments();

        // Build caption
        $user = $album->user;
        $contributor = $user->is_public ? ($user->anonymous_id ?? 'Kreator') : 'Kreator';
        $caption = $album->caption ? TelegramBot::escapeHtml($album->caption) . "\n\n👤 <b>Kontribusi:</b> {$contributor}" : "👤 <b>Kontribusi:</b> {$contributor}";

        if (!empty($visualMedia)) {
            // Send as media group
            $mediaGroup = [];
            foreach ($visualMedia as $index => $media) {
                $mediaType = $media['type'] === 'video' ? 'video' : 'photo';
                $item = [
                    'type' => $mediaType,
                    'media' => $media['file_id'],
                ];

                if ($index === 0) {
                    $item['caption'] = $caption;
                    $item['parse_mode'] = 'HTML';
                }

                $mediaGroup[] = $item;
            }

            $this->bot->sendMediaGroup($userId, $mediaGroup);

            // Send documents separately
            foreach ($documents as $doc) {
                $this->bot->sendDocument($userId, $doc['file_id']);
            }
        } elseif (!empty($documents)) {
            // Send documents with caption on first
            foreach ($documents as $index => $doc) {
                $options = [];
                if ($index === 0) {
                    $options['caption'] = $caption;
                }
                $this->bot->sendDocument($userId, $doc['file_id'], $options);
            }
        }
    }

    /**
     * Record download.
     */
    protected function recordDownload(Album $album, int $userId): void
    {
        // Insert ignore to prevent double count
        Download::updateOrCreate(
            ['album_id' => $album->id, 'user_id' => $userId],
            []
        );

        // Recalculate download count
        $count = Download::where('album_id', $album->id)->count();
        $album->update(['download_count' => $count]);

        // Update user download count
        $album->user->increment('download_count');
    }
}