<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Donation Settings
    |--------------------------------------------------------------------------
    */
    'donation' => [
        // Fee percentage yang diambil admin (0.10 = 10%)
        'fee_percentage' => env('DONATION_FEE_PERCENTAGE', 0.10),

        // Preset nominal donasi (dalam Rupiah)
        'preset_amounts' => [1000, 5000, 10000, 25000, 50000, 100000],

        // Minimal donasi
        'min_amount' => 1000,

        // Maksimal donasi
        'max_amount' => 100000000,
    ],

    /*
    |--------------------------------------------------------------------------
    | Withdrawal Settings
    |--------------------------------------------------------------------------
    */
    'withdrawal' => [
        // Minimal withdrawal (Rupiah)
        'min_amount' => 10000,

        // Maksimal withdrawal per request
        'max_amount' => 10000000,
    ],

    /*
    |--------------------------------------------------------------------------
    | Top-up Settings
    |--------------------------------------------------------------------------
    */
    'topup' => [
        // Minimal top-up
        'min_amount' => 10000,

        // Maksimal top-up
        'max_amount' => 100000000,
    ],

    /*
    |--------------------------------------------------------------------------
    | Verification Settings
    |--------------------------------------------------------------------------
    */
    'verification' => [
        // Enable creator verification before withdrawal
        'required_for_withdrawal' => true,
    ],
];