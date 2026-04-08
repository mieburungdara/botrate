<?php

namespace App\Console\Commands;

use App\Services\Telegram\TelegramBot;
use Illuminate\Console\Command;

class TelegramWebhook extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'telegram:webhook {action : set|delete|info}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Manage Telegram webhook';

    /**
     * Execute the console command.
     */
    public function handle(TelegramBot $bot)
    {
        $action = $this->argument('action');

        match ($action) {
            'set' => $this->setWebhook($bot),
            'delete' => $this->deleteWebhook($bot),
            'info' => $this->getWebhookInfo($bot),
            default => $this->error('Invalid action. Use: set, delete, or info'),
        };

        return Command::SUCCESS;
    }

    /**
     * Set webhook.
     */
    protected function setWebhook(TelegramBot $bot): void
    {
        $url = config('app.url') . '/api/webhook/telegram';
        $secret = config('telegram.webhook_secret');

        $this->info("Setting webhook to: {$url}");

        $result = $bot->setWebhook($url, [
            'secret_token' => $secret,
            'allowed_updates' => ['message', 'callback_query'],
        ]);

        if ($result) {
            $this->info('Webhook set successfully.');
        } else {
            $this->error('Failed to set webhook.');
        }
    }

    /**
     * Delete webhook.
     */
    protected function deleteWebhook(TelegramBot $bot): void
    {
        $this->info('Deleting webhook...');

        $result = $bot->deleteWebhook();

        if ($result) {
            $this->info('Webhook deleted successfully.');
        } else {
            $this->error('Failed to delete webhook.');
        }
    }

    /**
     * Get webhook info.
     */
    protected function getWebhookInfo(TelegramBot $bot): void
    {
        $this->info('Getting webhook info...');

        $info = $bot->getWebhookInfo();

        if ($info) {
            $this->table(
                ['Key', 'Value'],
                collect($info)->map(fn ($v, $k) => [$k, is_array($v) ? json_encode($v) : $v])->toArray()
            );
        } else {
            $this->error('Failed to get webhook info.');
        }
    }
}