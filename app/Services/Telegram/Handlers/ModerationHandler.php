<?php

namespace App\Services\Telegram\Handlers;

use App\Models\Album;
use App\Models\User;
use App\Services\Telegram\TelegramBot;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ModerationHandler
{
    protected TelegramBot $bot;

    public function __construct(TelegramBot $bot)
    {
        $this->bot = $bot;
    }

    /**
     * Handle approve callback.
     */
    public function handleApprove(int $albumId, array $callbackQuery): void
    {
        $callbackQueryId = $callbackQuery['id'];
        $adminId = $callbackQuery['from']['id'];

        // Verify admin
        if ($adminId != config('telegram.admin_user_id')) {
            $this->bot->answerCallbackQuery($callbackQueryId, ['text' => '⚠️ Anda bukan admin.', 'show_alert' => true]);
            return;
        }

        $album = Album::find($albumId);
        if (!$album || !$album->isPending()) {
            $this->bot->answerCallbackQuery($callbackQueryId, ['text' => '❌ Album tidak ditemukan atau sudah diproses.']);
            return;
        }

        // Generate unique token
        $uniqueToken = TelegramBot::generateToken();

        // Update album
        $album->update([
            'status' => Album::STATUS_APPROVED,
            'unique_token' => $uniqueToken,
            'approved_at' => now(),
        ]);

        // Post to channel
        $channelMessageId = $this->postToChannel($album, $uniqueToken);

        if ($channelMessageId) {
            $album->update(['channel_message_id' => $channelMessageId]);
        }

        // Notify user
        $this->notifyUserApproved($album, $uniqueToken, $channelMessageId);

        // Update moderation message
        $moderationGroupId = config('telegram.moderation_group_id');
        if ($album->moderator_message_id) {
            $this->bot->editMessageText(
                $moderationGroupId,
                $album->moderator_message_id,
                "✅ <b>Media Disetujui</b>\n\nMedia ini telah disetujui oleh admin."
            );
        }

        // Answer callback
        $this->bot->answerCallbackQuery($callbackQueryId, ['text' => '✅ Media telah disetujui.']);
    }

    /**
     * Handle reject callback (show reason options).
     */
    public function handleReject(int $albumId, array $callbackQuery): void
    {
        $callbackQueryId = $callbackQuery['id'];
        $adminId = $callbackQuery['from']['id'];

        // Verify admin
        if ($adminId != config('telegram.admin_user_id')) {
            $this->bot->answerCallbackQuery($callbackQueryId, ['text' => '⚠️ Anda bukan admin.', 'show_alert' => true]);
            return;
        }

        $album = Album::find($albumId);
        if (!$album || !$album->isPending()) {
            $this->bot->answerCallbackQuery($callbackQueryId, ['text' => '❌ Album tidak ditemukan atau sudah diproses.']);
            return;
        }

        // Show reject reason keyboard
        $keyboard = $this->buildRejectReasonKeyboard($albumId);

        $this->bot->editMessageText(
            config('telegram.moderation_group_id'),
            $album->moderator_message_id,
            "❌ Pilih alasan penolakan:",
            $keyboard
        );

        $this->bot->answerCallbackQuery($callbackQueryId);
    }

    /**
     * Handle reject with predefined reason.
     */
    public function handleRejectWithReason(int $albumId, string $reason, array $callbackQuery): void
    {
        $callbackQueryId = $callbackQuery['id'];

        $album = Album::find($albumId);
        if (!$album || !$album->isPending()) {
            $this->bot->answerCallbackQuery($callbackQueryId, ['text' => '❌ Album tidak ditemukan atau sudah diproses.']);
            return;
        }

        // Get reason label
        $reasons = config('botrate.reject_reasons', []);
        $reasonLabel = $reasons[$reason] ?? $reason;

        // Update album
        $album->update([
            'status' => Album::STATUS_REJECTED,
            'reject_reason' => $reasonLabel,
            'rejected_at' => now(),
        ]);

        // Notify user
        $this->notifyUserRejected($album, $reasonLabel);

        // Update moderation message
        $moderationGroupId = config('telegram.moderation_group_id');
        if ($album->moderator_message_id) {
            $this->bot->editMessageText(
                $moderationGroupId,
                $album->moderator_message_id,
                "❌ <b>Media Ditolak</b>\n\nAlasan: {$reasonLabel}"
            );
        }

        $this->bot->answerCallbackQuery($callbackQueryId, ['text' => "❌ Media ditolak: {$reasonLabel}"]);
    }

    /**
     * Handle custom reject reason (admin will type).
     */
    public function handleRejectCustom(int $albumId, array $callbackQuery): void
    {
        $callbackQueryId = $callbackQuery['id'];

        // Store pending custom reject in cache with admin ID as key
        $adminId = $callbackQuery['from']['id'];
        $cacheKey = "reject_custom:{$adminId}";
        Cache::put($cacheKey, ['album_id' => $albumId], 300); // 5 minutes

        // Update moderation message
        $moderationGroupId = config('telegram.moderation_group_id');
        if ($callbackQuery['message'] ?? null) {
            $msg = $callbackQuery['message'];
            $chatId = $msg['chat']['id'];
            $messageId = $msg['message_id'];

            $this->bot->editMessageText(
                $chatId,
                $messageId,
                "❌ Silakan ketik alasan penolakan untuk album #{$albumId}:"
            );
        }

        $this->bot->answerCallbackQuery($callbackQueryId, ['text' => 'Silakan ketik alasan penolakan.']);
    }

    /**
     * Handle custom reason text from admin.
     */
    public function handleCustomReasonText(int $adminId, string $text): void
    {
        // Find pending custom reject for this specific admin
        $cacheKey = "reject_custom:{$adminId}";
        $cached = Cache::get($cacheKey);
        
        if (!$cached || !isset($cached['album_id'])) {
            return; // No pending reject for this admin
        }
        
        $albumId = $cached['album_id'];
        
        // Verify album still exists and is pending
        $album = Album::where('id', $albumId)->where('status', Album::STATUS_PENDING)->first();
        if (!$album) {
            return;
        }

        // Update album
        $album->update([
            'status' => Album::STATUS_REJECTED,
            'reject_reason' => $text,
            'rejected_at' => now(),
        ]);

        // Notify user
        $this->notifyUserRejected($album, $text);

        // Update moderation message
        if ($album->moderator_message_id) {
            $this->bot->editMessageText(
                config('telegram.moderation_group_id'),
                $album->moderator_message_id,
                "❌ <b>Media Ditolak</b>\n\nAlasan: {$text}"
            );
        }

        $this->bot->sendMessage($adminId, "✅ Alasan penolakan telah disimpan.");
        
        // Clear cache
        Cache::forget($cacheKey);
    }

    /**
     * Post album info to channel.
     */
    protected function postToChannel(Album $album, string $uniqueToken): ?int
    {
        $channelId = config('telegram.public_channel_id');
        if (!$channelId) {
            Log::error('Public channel ID not configured');
            return null;
        }

        // Build caption
        $caption = $this->buildChannelCaption($album, $uniqueToken);

        // Build keyboard - now includes Donate button
        $keyboard = $this->buildChannelKeyboard($album->user_id, $uniqueToken);

        // Send text message (no media)
        $result = $this->bot->sendMessage($channelId, $caption, $keyboard);

        return $result['message_id'] ?? null;
    }

    /**
     * Build channel caption.
     */
    protected function buildChannelCaption(Album $album, string $uniqueToken): string
    {
        $user = $album->user;
        $contributor = $user->is_public ? ($user->anonymous_id ?? 'Kreator') : 'Kreator';

        $text = "📢 Media Baru Tersedia!\n\n";
        $text .= "👤 Kontribusi: {$contributor}";

        if ($album->caption) {
            $escapedCaption = TelegramBot::escapeHtml($album->caption);
            $text .= "\n📝 \"{$escapedCaption}\"";
        }

        $text .= "\n\n────────────────────";

        return $text;
    }

    /**
     * Build channel keyboard with deep link and donate button.
     */
    protected function buildChannelKeyboard(int $creatorUserId, string $uniqueToken): array
    {
        $botUsername = config('telegram.bot_username');
        $downloadLink = "https://t.me/{$botUsername}?start={$uniqueToken}";

        $buttons = [
            [
                $this->bot->urlButton('📥 Dapatkan Media Ini', $downloadLink),
                $this->bot->callbackButton('💝 Donasi', "donate_{$creatorUserId}_{$uniqueToken}"),
            ],
        ];

        return $this->bot->buildInlineKeyboard($buttons);
    }

    /**
     * Notify user that their media was approved.
     */
    protected function notifyUserApproved(Album $album, string $uniqueToken, ?int $channelMessageId): void
    {
        $channelUsername = config('telegram.channel_username');
        $channelId = config('telegram.public_channel_id');

        if ($channelUsername && $channelMessageId) {
            $channelLink = "https://t.me/{$channelUsername}/{$channelMessageId}";
        } elseif ($channelId && $channelMessageId) {
            $channelLink = "https://t.me/c/" . substr($channelId, 4) . "/{$channelMessageId}";
        } else {
            $channelLink = null;
        }

        $botUsername = config('telegram.bot_username');
        $shareLink = "https://t.me/{$botUsername}?start={$uniqueToken}";

        $text = "✅ <b>Media Anda berhasil dipublikasikan!</b>\n\n";
        $text .= "Media Anda telah disetujui dan dipublikasikan di channel.\n\n";

        if ($channelLink) {
            $text .= "🔗 Lihat di Channel:\n   {$channelLink}\n\n";
        }

        $text .= "📥 Bagikan media Anda dengan link:\n   {$shareLink}\n\n";
        $text .= "Terima kasih atas kontribusinya! 🎉";

        $this->bot->sendMessage($album->user_id, $text);
    }

    /**
     * Notify user that their media was rejected.
     */
    protected function notifyUserRejected(Album $album, string $reason): void
    {
        $text = "❌ <b>Media Ditolak</b>\n\n";
        $text .= "Media Anda tidak dapat dipublikasikan.\n\n";
        $text .= "Alasan: {$reason}";

        $this->bot->sendMessage($album->user_id, $text);
    }

    /**
     * Build reject reason keyboard.
     */
    protected function buildRejectReasonKeyboard(int $albumId): array
    {
        $reasons = config('botrate.reject_reasons', []);
        $rows = [];

        foreach ($reasons as $key => $label) {
            $rows[] = [
                $this->bot->callbackButton($label, "reject_confirm_{$albumId}_{$key}"),
            ];
        }

        // Add custom reason
        $rows[] = [
            $this->bot->callbackButton('✏️ Alasan lain (ketik manual)', "reject_custom_{$albumId}"),
        ];

        return $this->bot->buildInlineKeyboard($rows);
    }
}