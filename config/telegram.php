<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Telegram Bot Token
    |--------------------------------------------------------------------------
    |
    | Token bot Telegram yang didapat dari @BotFather
    |
    */

    'bot_token' => env('TELEGRAM_BOT_TOKEN'),

    /*
    |--------------------------------------------------------------------------
    | Telegram Bot Username
    |--------------------------------------------------------------------------
    |
    | Username bot (tanpa @). Contoh: BotRateBot
    |
    */

    'bot_username' => env('TELEGRAM_BOT_USERNAME'),

    /*
    |--------------------------------------------------------------------------
    | Webhook Secret Token
    |--------------------------------------------------------------------------
    |
    | Secret token untuk verifikasi webhook dari Telegram
    |
    */

    'webhook_secret' => env('TELEGRAM_WEBHOOK_SECRET'),

    /*
    |--------------------------------------------------------------------------
    | Admin User ID
    |--------------------------------------------------------------------------
    |
    | Telegram User ID dari admin utama (kebal dari blacklist)
    |
    */

    'admin_user_id' => env('TELEGRAM_ADMIN_USER_ID'),

    /*
    |--------------------------------------------------------------------------
    | Moderation Group ID
    |--------------------------------------------------------------------------
    |
    | Group ID untuk moderasi media (format: -100xxxxxxxxxx)
    |
    */

    'moderation_group_id' => env('TELEGRAM_MODERATION_GROUP_ID'),

    /*
    |--------------------------------------------------------------------------
    | Public Channel ID
    |--------------------------------------------------------------------------
    |
    | Channel ID untuk publikasi media yang sudah disetujui
    |
    */

    'public_channel_id' => env('TELEGRAM_PUBLIC_CHANNEL_ID'),

    /*
    |--------------------------------------------------------------------------
    | Channel Username
    |--------------------------------------------------------------------------
    |
    | Username channel (tanpa @) untuk link langsung ke pesan
    |
    */

    'channel_username' => env('TELEGRAM_CHANNEL_USERNAME'),

    /*
    |--------------------------------------------------------------------------
    | Telegram API Base URL
    |--------------------------------------------------------------------------
    */

    'api_base_url' => 'https://api.telegram.org/bot',

];