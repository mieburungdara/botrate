<?php

namespace App\Services\Telegram\Handlers;

use App\Models\Album;
use App\Models\User;
use App\Services\Telegram\TelegramBot;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class AlbumHandler
{
    protected TelegramBot $bot;

    public function __construct(TelegramBot $bot)
    {
        $this->bot = $bot;
    }

    /**
     * Handle incoming media message.
     */
    public function handle(array $update, User $user): void
    {
        $message = $update['message'] ?? $update['edited_message'] ?? null;
        if (!$message) {
            return;
        }

        $chatId = $message['chat']['id'];
        $messageId = $message['message_id'];
        $mediaGroupId = $message['media_group_id'] ?? null;
        $caption = $message['caption'] ?? null;

        // Check if this is part of an album
        if ($mediaGroupId) {
            $this->handleAlbum($message, $user, $mediaGroupId, $caption);
        } else {
            $this->handleSingleMedia($message, $user, $caption);
        }
    }

    /**
     * Handle album (media group).
     */
    protected function handleAlbum(array $message, User $user, string $mediaGroupId, ?string $caption): void
    {
        $cacheKey = "album_pending:{$user->user_id}:{$mediaGroupId}";

        // Get or initialize pending album buffer
        $buffer = Cache::get($cacheKey, []);

        // Add this media item
        $mediaItem = $this->extractMediaItem($message);
        if ($mediaItem) {
            $buffer[] = $mediaItem;
        }

        // Update buffer with timeout
        Cache::put($cacheKey, $buffer, config('botrate.album.aggregation_timeout', 600));

        // Check if we should process now (last message in group)
        // Telegram sends album messages in quick succession, so we wait a bit
        $processKey = "album_process:{$user->user_id}:{$mediaGroupId}";

        if (!Cache::has($processKey)) {
            // Set a delay to wait for all album messages
            Cache::put($processKey, true, 5); // 5 second delay

            // Schedule processing after delay
            $this->scheduleAlbumProcessing($user, $mediaGroupId, $caption, $message['chat']['id'], $message['message_id']);
        }
    }

    /**
     * Schedule album processing after aggregation delay.
     */
    protected function scheduleAlbumProcessing(User $user, string $mediaGroupId, ?string $caption, int $chatId, int $messageId): void
    {
        // For simplicity in webhook context, we'll process immediately after a short wait
        // In production, use Laravel Queue
        sleep(3);

        $cacheKey = "album_pending:{$user->user_id}:{$mediaGroupId}";
        $buffer = Cache::get($cacheKey, []);

        if (empty($buffer)) {
            return;
        }

        // Create album record
        $album = Album::create([
            'user_id' => $user->user_id,
            'message_ids' => [$messageId],
            'media_items' => $buffer,
            'chat_id' => $chatId,
            'caption' => $caption,
            'unique_token' => TelegramBot::generateToken(),
            'status' => Album::STATUS_PENDING,
        ]);

        // Clear cache
        Cache::forget($cacheKey);

        // Send to moderation group
        $this->sendToModeration($album, $user);

        // Reply to user
        $this->bot->sendMessage($chatId, "📥 Media Anda sedang dalam proses moderasi. Harap tunggu.");

        // Update user album count
        $user->increment('album_count');
    }

    /**
     * Handle single media (not part of album).
     */
    protected function handleSingleMedia(array $message, User $user, ?string $caption): void
    {
        $mediaItem = $this->extractMediaItem($message);
        if (!$mediaItem) {
            return;
        }

        // Create album record (single item)
        $album = Album::create([
            'user_id' => $user->user_id,
            'message_ids' => [$message['message_id']],
            'media_items' => [$mediaItem],
            'chat_id' => $message['chat']['id'],
            'caption' => $caption,
            'unique_token' => TelegramBot::generateToken(),
            'status' => Album::STATUS_PENDING,
        ]);

        // Send to moderation group
        $this->sendToModeration($album, $user);

        // Reply to user
        $this->bot->sendMessage($message['chat']['id'], "📥 Media Anda sedang dalam proses moderasi. Harap tunggu.");

        // Update user album count
        $user->increment('album_count');
    }

    /**
     * Extract media item from message.
     */
    protected function extractMediaItem(array $message): ?array
    {
        if (isset($message['photo'])) {
            // Photo - get the largest size
            $photos = $message['photo'];
            $largest = end($photos);
            return [
                'type' => 'photo',
                'file_id' => $largest['file_id'],
            ];
        }

        if (isset($message['video'])) {
            return [
                'type' => 'video',
                'file_id' => $message['video']['file_id'],
            ];
        }

        if (isset($message['document'])) {
            return [
                'type' => 'document',
                'file_id' => $message['document']['file_id'],
            ];
        }

        return null;
    }

    /**
     * Send album to moderation group.
     */
    protected function sendToModeration(Album $album, User $user): void
    {
        $moderationGroupId = config('telegram.moderation_group_id');
        if (!$moderationGroupId) {
            Log::error('Moderation group ID not configured');
            return;
        }

        // Build caption
        $caption = $this->buildModerationCaption($user, $album->caption);

        // Build keyboard
        $keyboard = $this->buildModerationKeyboard($album->id);

        // Get media items
        $mediaItems = $album->getMediaItems();
        $visualMedia = $album->getVisualMedia();
        $documents = $album->getDocuments();

        // Send first visual media with caption, or document if no visual
        if (!empty($visualMedia)) {
            // Build media group for moderation
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

            $result = $this->bot->sendMediaGroup($moderationGroupId, $mediaGroup, $keyboard);

            if ($result) {
                $album->update([
                    'moderator_message_id' => $result[0]['message_id'],
                ]);
            }
        } elseif (!empty($documents)) {
            // Send first document with caption
            $firstDoc = $documents[0];
            $result = $this->bot->sendDocument(
                $moderationGroupId,
                $firstDoc['file_id'],
                array_merge(['caption' => $caption], $keyboard)
            );

            if ($result) {
                $album->update([
                    'moderator_message_id' => $result['message_id'],
                ]);
            }
        }
    }

    /**
     * Build moderation caption.
     */
    protected function buildModerationCaption(User $user, ?string $caption): string
    {
        $username = $user->username ? "@{$user->username}" : '(tidak ada)';
        $fullName = $user->full_name ?: '(tidak ada)';
        $captionText = $caption ?: '(tanpa caption)';

        // Truncate if too long
        if (strlen($captionText) > 1024) {
            $captionText = substr($captionText, 0, 1021) . '...';
        }

        return "📥 Media Baru untuk Dimoderasi\n\n" .
               "🆔 User ID: {$user->user_id}\n" .
               "👤 Username: {$username}\n" .
               "📛 Nama: {$fullName}\n" .
               "🏷️ Anonim: {$user->anonymous_id}\n" .
               "📝 Caption: \"{$captionText}\"\n\n" .
               "────────────────────";
    }

    /**
     * Build moderation keyboard.
     */
    protected function buildModerationKeyboard(int $albumId): array
    {
        return $this->bot->buildInlineKeyboard([
            [
                $this->bot->callbackButton('✅ Setuju', "approve_{$albumId}"),
                $this->bot->callbackButton('❌ Tolak', "reject_{$albumId}"),
            ],
        ]);
    }
}