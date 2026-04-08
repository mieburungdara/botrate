<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\TelegramWebhookController;
use App\Http\Controllers\WalletController;
use App\Http\Controllers\WebAppController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// Telegram webhook endpoint
Route::post('/webhook/telegram', [TelegramWebhookController::class, 'handle'])
    ->middleware('telegram.secret')
    ->name('telegram.webhook');

// WebApp User API
Route::prefix('webapp')->group(function () {
    Route::get('/stats', [WebAppController::class, 'stats']);
    Route::get('/profile', [WebAppController::class, 'profile']);
    Route::post('/toggle-public', [WebAppController::class, 'togglePublic']);
    Route::get('/album/{id}', [WebAppController::class, 'albumDetail']);
    Route::get('/leaderboard', [WebAppController::class, 'leaderboard']);

    // Wallet API
    Route::get('/wallet/balance', [WalletController::class, 'balance']);
    Route::post('/wallet/topup', [WalletController::class, 'requestTopup']);
    Route::post('/wallet/upload-proof', [WalletController::class, 'uploadProof']);
    Route::get('/wallet/history', [WalletController::class, 'history']);
    Route::post('/wallet/withdraw', [WalletController::class, 'requestWithdrawal']);
    Route::get('/wallet/withdrawals', [WalletController::class, 'withdrawalHistory']);
    Route::post('/wallet/verify-kyc', [WalletController::class, 'verifyKyc']);

    // Admin API
    Route::get('/admin/stats', [AdminController::class, 'stats']);
    Route::get('/admin/pending', [AdminController::class, 'pendingAlbums']);
    Route::get('/admin/history', [AdminController::class, 'history']);
    Route::post('/admin/approve/{id}', [AdminController::class, 'approve']);
    Route::post('/admin/reject/{id}', [AdminController::class, 'reject']);
    Route::get('/admin/reject-reasons', [AdminController::class, 'rejectReasons']);

    // Admin Wallet Management
    Route::get('/admin/pending-topups', [AdminController::class, 'pendingTopups']);
    Route::post('/admin/topup/verify/{id}', [AdminController::class, 'verifyTopup']);
    Route::get('/admin/pending-withdrawals', [AdminController::class, 'pendingWithdrawals']);
    Route::post('/admin/withdraw/approve/{id}', [AdminController::class, 'approveWithdrawal']);
    Route::post('/admin/withdraw/reject/{id}', [AdminController::class, 'rejectWithdrawal']);
    Route::get('/admin/verify-creators', [AdminController::class, 'pendingVerifications']);
    Route::post('/admin/verify/approve/{id}', [AdminController::class, 'approveVerification']);
});