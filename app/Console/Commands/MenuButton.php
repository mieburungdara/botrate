<?php

namespace App\Console\Commands;

use App\Services\Telegram\TelegramBot;
use Illuminate\Console\Command;

class MenuButton extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'telegram:menu-button {action : set|default|info} {--url= : WebApp URL}';

    /**
     * The console command description.
     */
    protected $description = 'Manage Telegram bot menu button';

    /**
     * Execute the console command.
     */
    public function handle(TelegramBot $bot)
    {
        $action = $this->argument('action');

        match ($action) {
            'set' => $this->setMenuButton($bot),
            'default' => $this->setDefaultMenuButton($bot),
            'info' => $this->getMenuButtonInfo($bot),
            default => $this->error('Invalid action. Use: set, default, or info'),
        };

        return Command::SUCCESS;
    }

    /**
     * Set menu button to WebApp.
     */
    protected function setMenuButton(TelegramBot $bot): void
    {
        $url = $this->option('url') ?? config('app.url') . '/webapp';

        $this->info("Setting menu button to WebApp: {$url}");

        $result = $bot->request('setChatMenuButton', [
            'menu_button' => [
                'type' => 'web_app',
                'text' => '📱 Dashboard',
                'web_app' => [
                    'url' => $url,
                ],
            ],
        ]);

        if ($result) {
            $this->info('Menu button set successfully.');
        } else {
            $this->error('Failed to set menu button.');
        }
    }

    /**
     * Set default menu button.
     */
    protected function setDefaultMenuButton(TelegramBot $bot): void
    {
        $this->info('Setting menu button to default...');

        $result = $bot->request('setChatMenuButton', [
            'menu_button' => [
                'type' => 'default',
            ],
        ]);

        if ($result) {
            $this->info('Menu button reset to default.');
        } else {
            $this->error('Failed to reset menu button.');
        }
    }

    /**
     * Get menu button info.
     */
    protected function getMenuButtonInfo(TelegramBot $bot): void
    {
        $this->info('Getting menu button info...');

        $info = $bot->request('getChatMenuButton');

        if ($info) {
            $this->table(
                ['Key', 'Value'],
                collect($info)->map(fn ($v, $k) => [$k, is_array($v) ? json_encode($v) : $v])->toArray()
            );
        } else {
            $this->error('Failed to get menu button info.');
        }
    }
}