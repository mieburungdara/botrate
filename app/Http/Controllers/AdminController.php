<?php

namespace App\Http\Controllers;

use App\Models\Album;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Withdrawal;
use App\Services\Telegram\Handlers\ModerationHandler;
use App\Services\Telegram\TelegramBot;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class AdminController extends Controller
{
    protected TelegramBot $bot;
    protected ModerationHandler $moderationHandler;

    public function __construct(TelegramBot $bot, ModerationHandler $moderationHandler)
    {
        $this->bot = $bot;
        $this->moderationHandler = $moderationHandler;
    }

    /**
     * Get admin stats.
     */
    public function stats(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $pendingCount = Album::where('status', Album::STATUS_PENDING)->count();
        $approvedCount = Album::where('status', Album::STATUS_APPROVED)->count();
        $rejectedCount = Album::where('status', Album::STATUS_REJECTED)->count();
        $totalCount = Album::count();

        return response()->json([
            'stats' => [
                'total' => $totalCount,
                'pending' => $pendingCount,
                'approved' => $approvedCount,
                'rejected' => $rejectedCount,
            ],
        ]);
    }

    /**
     * Get pending albums.
     */
    public function pendingAlbums(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $albums = Album::where('status', Album::STATUS_PENDING)
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        return response()->json([
            'albums' => $albums->map(fn ($a) => $this->formatAlbum($a)),
        ]);
    }

    /**
     * Get album history (approved/rejected).
     */
    public function history(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $status = $request->query('status');
        $query = Album::whereIn('status', [Album::STATUS_APPROVED, Album::STATUS_REJECTED])
            ->with('user')
            ->orderBy('approved_at', 'desc')
            ->orderBy('rejected_at', 'desc')
            ->limit(50);

        if ($status && in_array($status, [Album::STATUS_APPROVED, Album::STATUS_REJECTED])) {
            $query->where('status', $status);
        }

        $albums = $query->get();

        return response()->json([
            'albums' => $albums->map(fn ($a) => $this->formatAlbum($a)),
        ]);
    }

    /**
     * Approve album.
     */
    public function approve(Request $request, int $id)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $album = Album::with('user')->find($id);
        if (!$album || !$album->isPending()) {
            return response()->json(['error' => 'Album not found or already processed'], 404);
        }

        DB::beginTransaction();

        try {
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

            DB::commit();

            // Notify user (outside transaction)
            $this->notifyUserApproved($album, $uniqueToken, $channelMessageId);

            return response()->json([
                'success' => true,
                'message' => 'Album approved successfully',
                'share_link' => "https://t.me/" . config('telegram.bot_username') . "?start={$uniqueToken}",
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Album approval failed', [
                'album_id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json(['error' => 'Failed to approve album'], 500);
        }
    }

    /**
     * Reject album with predefined reason.
     */
    public function reject(Request $request, int $id)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $request->validate([
            'reason' => 'required|string|max:100',
        ]);

        $album = Album::with('user')->find($id);
        if (!$album || !$album->isPending()) {
            return response()->json(['error' => 'Album not found or already processed'], 404);
        }

        DB::beginTransaction();

        try {
            $reasons = config('botrate.reject_reasons', []);
            $reasonLabel = $reasons[$request->reason] ?? $request->reason;

            $album->update([
                'status' => Album::STATUS_REJECTED,
                'reject_reason' => $reasonLabel,
                'rejected_at' => now(),
            ]);

            DB::commit();

            // Notify user (outside transaction)
            $this->notifyUserRejected($album, $reasonLabel);

            return response()->json([
                'success' => true,
                'message' => 'Album rejected',
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Album rejection failed', [
                'album_id' => $id,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['error' => 'Failed to reject album'], 500);
        }
    }

    /**
     * Get reject reasons.
     */
    public function rejectReasons()
    {
        return response()->json([
            'reasons' => config('botrate.reject_reasons', []),
        ]);
    }

    /**
     * Get pending top-up transactions.
     */
    public function pendingTopups(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $topups = Transaction::where('type', Transaction::TYPE_TOPUP)
            ->where('status', Transaction::STATUS_PENDING)
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'topups' => $topups->map(fn ($t) => [
                'id' => $t->id,
                'user_id' => $t->user_id,
                'username' => $t->user?->username ?? 'N/A',
                'amount' => $t->amount,
                'payment_method' => $t->payment_method,
                'payment_proof' => $t->payment_proof ? asset('storage/' . $t->payment_proof) : null,
                'created_at' => $t->created_at,
            ]),
        ]);
    }

    /**
     * Verify top-up transaction.
     */
    public function verifyTopup(Request $request, int $id)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $transaction = Transaction::with('user')
            ->where('id', $id)
            ->where('type', Transaction::TYPE_TOPUP)
            ->where('status', Transaction::STATUS_PENDING)
            ->first();

        if (!$transaction || !$transaction->user) {
            return response()->json(['error' => 'Transaction not found or user missing'], 404);
        }

        DB::beginTransaction();

        try {
            // Update transaction status
            $transaction->update(['status' => Transaction::STATUS_COMPLETED]);

            // Add balance to user
            $transaction->user->increment('balance', $transaction->amount);
            $transaction->user->refresh();

            DB::commit();

            // Notify user
            $this->bot->sendMessage(
                $transaction->user->user_id,
                "✅ <b>Top-up Berhasil!</b>\n\n" .
                "💳 Nominal: RP " . number_format($transaction->amount, 0, ',', '.') . "\n" .
                "💰 Saldo Anda sekarang: RP " . number_format($transaction->user->balance, 0, ',', '.')
            );

            return response()->json([
                'success' => true,
                'message' => 'Top-up verified successfully',
                'new_balance' => $transaction->user->balance,
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Top-up verification failed', [
                'transaction_id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json(['error' => 'Failed to verify top-up'], 500);
        }
    }

    /**
     * Get pending withdrawals.
     */
    public function pendingWithdrawals(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $withdrawals = Withdrawal::where('status', Withdrawal::STATUS_PENDING)
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'withdrawals' => $withdrawals->map(fn ($w) => [
                'id' => $w->id,
                'user_id' => $w->user_id,
                'username' => $w->user?->username ?? 'N/A',
                'amount' => $w->amount,
                'bank_name' => $w->bank_name,
                'bank_number' => $w->bank_number,
                'account_name' => $w->account_name,
                'created_at' => $w->created_at,
            ]),
        ]);
    }

    /**
     * Approve withdrawal.
     */
    public function approveWithdrawal(Request $request, int $id)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $withdrawal = Withdrawal::with('user')
            ->where('id', $id)
            ->where('status', Withdrawal::STATUS_PENDING)
            ->first();

        if (!$withdrawal || !$withdrawal->user) {
            return response()->json(['error' => 'Withdrawal not found or user missing'], 404);
        }

        DB::beginTransaction();

        try {
            // Update withdrawal status
            $withdrawal->update(['status' => Withdrawal::STATUS_COMPLETED]);

            // Update transaction status
            Transaction::where('user_id', $withdrawal->user_id)
                ->where('type', Transaction::TYPE_WITHDRAWAL)
                ->where('amount', $withdrawal->amount)
                ->where('status', Transaction::STATUS_PENDING)
                ->update(['status' => Transaction::STATUS_COMPLETED]);

            DB::commit();

            // Notify user
            $this->bot->sendMessage(
                $withdrawal->user->user_id,
                "✅ <b>Penarikan Berhasil!</b>\n\n" .
                "💳 Nominal: RP " . number_format($withdrawal->amount, 0, ',', '.') . "\n" .
                "🏦 {$withdrawal->bank_name} a/n {$withdrawal->account_name}\n\n" .
                "Uang telah ditransfer. Saldo Anda: RP " . number_format($withdrawal->user->balance, 0, ',', '.')
            );

            return response()->json([
                'success' => true,
                'message' => 'Withdrawal approved',
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Withdrawal approval failed', [
                'withdrawal_id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json(['error' => 'Failed to approve withdrawal'], 500);
        }
    }

    /**
     * Reject withdrawal.
     */
    public function rejectWithdrawal(Request $request, int $id)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $request->validate([
            'reason' => 'required|string|max:200',
        ]);

        $withdrawal = Withdrawal::with('user')
            ->where('id', $id)
            ->where('status', Withdrawal::STATUS_PENDING)
            ->first();

        if (!$withdrawal || !$withdrawal->user) {
            return response()->json(['error' => 'Withdrawal not found or user missing'], 404);
        }

        DB::beginTransaction();

        try {
            // Update withdrawal status
            $withdrawal->update([
                'status' => Withdrawal::STATUS_REJECTED,
                'admin_notes' => $request->reason,
            ]);

            // Refund balance to user
            $withdrawal->user->increment('balance', $withdrawal->amount);

            // Update transaction status
            Transaction::where('user_id', $withdrawal->user_id)
                ->where('type', Transaction::TYPE_WITHDRAWAL)
                ->where('amount', $withdrawal->amount)
                ->where('status', Transaction::STATUS_PENDING)
                ->update([
                    'status' => Transaction::STATUS_CANCELLED,
                    'admin_notes' => $request->reason,
                ]);

            DB::commit();

            // Notify user
            $this->bot->sendMessage(
                $withdrawal->user->user_id,
                "❌ <b>Penarikan Ditolak</b>\n\n" .
                "💳 Nominal: RP " . number_format($withdrawal->amount, 0, ',', '.') . "\n" .
                "Alasan: {$request->reason}\n\n" .
                "Saldo telah dikembalikan ke akun Anda."
            );

            return response()->json([
                'success' => true,
                'message' => 'Withdrawal rejected',
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Withdrawal rejection failed', [
                'withdrawal_id' => $id,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['error' => 'Failed to reject withdrawal'], 500);
        }
    }

    /**
     * Get pending creator verifications.
     */
    public function pendingVerifications(Request $request)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $users = User::where(function($query) {
                $query->whereNotNull('verification_notes')
                    ->orWhereNotNull('selfie_proof')
                    ->orWhereNotNull('ktp_proof');
            })
            ->where('is_verified', false)
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        return response()->json([
            'verifications' => $users->map(fn ($u) => [
                'id' => $u->user_id,
                'username' => $u->username,
                'full_name' => $u->full_name,
                'is_verified' => $u->is_verified,
                'verification_notes' => $u->verification_notes,
                'selfie_proof' => $u->selfie_proof ? asset('storage/' . $u->selfie_proof) : null,
                'ktp_proof' => $u->ktp_proof ? asset('storage/' . $u->ktp_proof) : null,
                'created_at' => $u->created_at,
            ]),
        ]);
    }

    /**
     * Approve creator verification.
     */
    public function approveVerification(Request $request, int $userId)
    {
        if (!$this->isAdmin($request)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $user = User::find($userId);
        if (!$user) {
            return response()->json(['error' => 'User not found'], 404);
        }

        DB::beginTransaction();

        try {
            $user->update([
                'is_verified' => true,
                'verification_notes' => 'Verified by admin on ' . now()->toDateTimeString(),
            ]);

            DB::commit();

            // Notify user
            $this->bot->sendMessage(
                $user->user_id,
                "✅ <b>Verifikasi Berhasil!</b>\n\n" .
                "Akun Anda telah terverifikasi. Anda sekarang dapat melakukan penarikan.\n\n" .
                "Saldo Anda: RP " . number_format($user->balance, 0, ',', '.')
            );

            return response()->json([
                'success' => true,
                'message' => 'User verified successfully',
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Verification approval failed', [
                'user_id' => $userId,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['error' => 'Failed to verify user'], 500);
        }
    }

    /**
     * Check if user is admin.
     */
    protected function isAdmin(Request $request): bool
    {
        $initData = $request->header('X-Telegram-Init-Data');
        if (!$initData) {
            return false;
        }

        parse_str($initData, $data);
        if (!isset($data['user'])) {
            return false;
        }

        $userData = json_decode($data['user'], true);
        if (!is_array($userData) || !isset($userData['id'])) {
            return false;
        }

        return (int) $userData['id'] === (int) config('telegram.admin_user_id');
    }

    /**
     * Format album for response.
     */
    protected function formatAlbum(Album $album): array
    {
        $user = $album->user;
        return [
            'id' => $album->id,
            'status' => $album->status,
            'caption' => $album->caption,
            'sender' => [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'full_name' => $user->full_name,
                'anonymous_id' => $user->anonymous_id,
            ],
            'download_count' => $album->download_count,
            'created_at' => $album->created_at,
            'approved_at' => $album->approved_at,
            'rejected_at' => $album->rejected_at,
            'reject_reason' => $album->reject_reason,
        ];
    }

    /**
     * Post album info to channel.
     */
    protected function postToChannel(Album $album, string $uniqueToken): ?int
    {
        $channelId = config('telegram.public_channel_id');
        if (!$channelId) {
            return null;
        }

        $user = $album->user;
        $contributor = $user->is_public ? ($user->anonymous_id ?? 'Kreator') : 'Kreator';

        $text = "📢 Media Baru Tersedia!\n\n";
        $text .= "👤 Kontribusi: {$contributor}";

        if ($album->caption) {
            $escapedCaption = TelegramBot::escapeHtml($album->caption);
            $text .= "\n📝 \"{$escapedCaption}\"";
        }

        $text .= "\n\n────────────────────";

        $botUsername = config('telegram.bot_username');
        $deepLink = "https://t.me/{$botUsername}?start={$uniqueToken}";

        $keyboard = $this->bot->buildInlineKeyboard([
            [
                $this->bot->urlButton('📥 Dapatkan Media Ini', $deepLink),
                $this->bot->callbackButton('💝 Donasi', "donate_{$user->user_id}_{$uniqueToken}"),
            ],
        ]);

        $result = $this->bot->sendMessage($channelId, $text, $keyboard);

        return $result['message_id'] ?? null;
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
}