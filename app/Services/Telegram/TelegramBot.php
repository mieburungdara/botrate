<?php

namespace App\Services\Telegram;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Support\Facades\Log;

class TelegramBot
{
    protected Client $client;
    protected string $token;
    protected string $baseUrl;

    public function __construct()
    {
        $this->token = config('telegram.bot_token');
        $this->baseUrl = config('telegram.api_base_url') . $this->token . '/';
        $this->client = new Client([
            'base_uri' => $this->baseUrl,
            'timeout' => 30,
            'connect_timeout' => 10,
        ]);
    }

    /**
     * Make API request to Telegram.
     */
    public function request(string $method, array $data = []): mixed
    {
        try {
            $response = $this->client->post($method, [
                'json' => $data,
            ]);

            $body = json_decode($response->getBody()->getContents(), true);

            if (!$body['ok']) {
                Log::error('Telegram API Error', [
                    'method' => $method,
                    'data' => $data,
                    'error' => $body['description'] ?? 'Unknown error',
                ]);
                return null;
            }

            return $body['result'] ?? null;
        } catch (GuzzleException $e) {
            Log::error('Telegram Request Failed', [
                'method' => $method,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Send text message.
     */
    public function sendMessage(int|string $chatId, string $text, array $options = []): ?array
    {
        $data = array_merge([
            'chat_id' => $chatId,
            'text' => $text,
            'parse_mode' => 'HTML',
        ], $options);

        return $this->request('sendMessage', $data);
    }

    /**
     * Reply to a message.
     */
    public function reply(int|string $chatId, int $replyToMessageId, string $text, array $options = []): ?array
    {
        $data = array_merge([
            'chat_id' => $chatId,
            'text' => $text,
            'parse_mode' => 'HTML',
            'reply_to_message_id' => $replyToMessageId,
        ], $options);

        return $this->request('sendMessage', $data);
    }

    /**
     * Edit message text.
     */
    public function editMessageText(int|string $chatId, int $messageId, string $text, array $options = []): ?array
    {
        $data = array_merge([
            'chat_id' => $chatId,
            'message_id' => $messageId,
            'text' => $text,
            'parse_mode' => 'HTML',
        ], $options);

        return $this->request('editMessageText', $data);
    }

    /**
     * Edit message text by inline message ID.
     */
    public function editMessageTextInline(string $inlineMessageId, string $text, array $options = []): ?array
    {
        $data = array_merge([
            'inline_message_id' => $inlineMessageId,
            'text' => $text,
            'parse_mode' => 'HTML',
        ], $options);

        return $this->request('editMessageText', $data);
    }

    /**
     * Send media group (album).
     */
    public function sendMediaGroup(int|string $chatId, array $media, array $options = []): ?array
    {
        $data = array_merge([
            'chat_id' => $chatId,
            'media' => json_encode($media),
        ], $options);

        return $this->request('sendMediaGroup', $data);
    }

    /**
     * Send single photo.
     */
    public function sendPhoto(int|string $chatId, string $fileId, array $options = []): ?array
    {
        $data = array_merge([
            'chat_id' => $chatId,
            'photo' => $fileId,
            'parse_mode' => 'HTML',
        ], $options);

        return $this->request('sendPhoto', $data);
    }

    /**
     * Send single video.
     */
    public function sendVideo(int|string $chatId, string $fileId, array $options = []): ?array
    {
        $data = array_merge([
            'chat_id' => $chatId,
            'video' => $fileId,
            'parse_mode' => 'HTML',
        ], $options);

        return $this->request('sendVideo', $data);
    }

    /**
     * Send document.
     */
    public function sendDocument(int|string $chatId, string $fileId, array $options = []): ?array
    {
        $data = array_merge([
            'chat_id' => $chatId,
            'document' => $fileId,
            'parse_mode' => 'HTML',
        ], $options);

        return $this->request('sendDocument', $data);
    }

    /**
     * Forward message.
     */
    public function forwardMessage(int|string $chatId, int|string $fromChatId, int $messageId, array $options = []): ?array
    {
        $data = array_merge([
            'chat_id' => $chatId,
            'from_chat_id' => $fromChatId,
            'message_id' => $messageId,
        ], $options);

        return $this->request('forwardMessage', $data);
    }

    /**
     * Copy message (forward without sender info).
     */
    public function copyMessage(int|string $chatId, int|string $fromChatId, int $messageId, array $options = []): ?array
    {
        $data = array_merge([
            'chat_id' => $chatId,
            'from_chat_id' => $fromChatId,
            'message_id' => $messageId,
        ], $options);

        return $this->request('copyMessage', $data);
    }

    /**
     * Delete message.
     */
    public function deleteMessage(int|string $chatId, int $messageId): ?bool
    {
        $result = $this->request('deleteMessage', [
            'chat_id' => $chatId,
            'message_id' => $messageId,
        ]);

        return $result === true;
    }

    /**
     * Answer callback query.
     */
    public function answerCallbackQuery(string $callbackQueryId, array $options = []): ?bool
    {
        $data = array_merge([
            'callback_query_id' => $callbackQueryId,
        ], $options);

        $result = $this->request('answerCallbackQuery', $data);

        return $result === true;
    }

    /**
     * Get file info.
     */
    public function getFile(string $fileId): ?array
    {
        return $this->request('getFile', ['file_id' => $fileId]);
    }

    /**
     * Get user profile photos.
     */
    public function getUserProfilePhotos(int $userId, array $options = []): ?array
    {
        $data = array_merge([
            'user_id' => $userId,
            'limit' => 1,
        ], $options);

        return $this->request('getUserProfilePhotos', $data);
    }

    /**
     * Set webhook.
     */
    public function setWebhook(string $url, array $options = []): ?bool
    {
        $data = array_merge([
            'url' => $url,
        ], $options);

        $result = $this->request('setWebhook', $data);

        return $result === true;
    }

    /**
     * Delete webhook.
     */
    public function deleteWebhook(): ?bool
    {
        $result = $this->request('deleteWebhook');

        return $result === true;
    }

    /**
     * Get webhook info.
     */
    public function getWebhookInfo(): ?array
    {
        return $this->request('getWebhookInfo');
    }

    /**
     * Get bot info.
     */
    public function getMe(): ?array
    {
        return $this->request('getMe');
    }

    /**
     * Build inline keyboard.
     */
    public function buildInlineKeyboard(array $rows): array
    {
        return [
            'reply_markup' => json_encode([
                'inline_keyboard' => $rows,
            ]),
        ];
    }

    /**
     * Build inline keyboard button.
     */
    public function inlineButton(string $text, array $options): array
    {
        return array_merge(['text' => $text], $options);
    }

    /**
     * Build callback button.
     */
    public function callbackButton(string $text, string $callbackData): array
    {
        return $this->inlineButton($text, ['callback_data' => $callbackData]);
    }

    /**
     * Build URL button.
     */
    public function urlButton(string $text, string $url): array
    {
        return $this->inlineButton($text, ['url' => $url]);
    }

    /**
     * Escape HTML text for Telegram.
     */
    public static function escapeHtml(string $text): string
    {
        return htmlspecialchars($text, ENT_NOQUOTES, 'UTF-8');
    }

    /**
     * Generate unique token (32-char hex).
     */
    public static function generateToken(): string
    {
        return bin2hex(random_bytes(16));
    }

    /**
     * Generate anonymous ID.
     * Fix: Use full 10 characters to avoid collisions (bin2hex(5) = 10 chars)
     */
    public static function generateAnonymousId(): string
    {
        $prefix = config('botrate.anonymous_prefix', 'BA-');
        $random = bin2hex(random_bytes(5)); // 10 hex characters
        return $prefix . strtoupper($random); // Use full 10 chars, not substr
    }
}