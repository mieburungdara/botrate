<?php

namespace App\Http\Controllers;

use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class WalletController extends Controller
{
    /**
     * Get user balance.
     */
    public function balance(Request $request)
    {
        $user = $this->validateUser($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        return response()->json([
            'balance' => $user->balance,
            'is_verified' => $user->is_verified,
        ]);
    }

    /**
     * Request top-up (generate payment instructions).
     */
    public function requestTopup(Request $request)
    {
        $user = $this->validateUser($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $request->validate([
            'amount' => 'required|integer|min:' . config('botrate.topup.min_amount') . '|max:' . config('botrate.topup.max_amount'),
            'payment_method' => 'required|string|in:ovo,dana,qris,bca',
        ]);

        $amount = $request->amount;

        // Create pending transaction
        $transaction = Transaction::create([
            'user_id' => $user->user_id,
            'type' => Transaction::TYPE_TOPUP,
            'amount' => $amount,
            'status' => Transaction::STATUS_PENDING,
            'payment_method' => $request->payment_method,
        ]);

        // Generate payment instructions
        $paymentInfo = $this->getPaymentInstructions($request->payment_method, $amount);

        return response()->json([
            'success' => true,
            'transaction_id' => $transaction->id,
            'amount' => $amount,
            'payment_method' => $request->payment_method,
            'payment_info' => $paymentInfo,
            'instructions' => "Silakan transfer RP " . number_format($amount, 0, ',', '.') . " ke:\n\n" . $paymentInfo,
        ]);
    }

    /**
     * Upload payment proof.
     */
    public function uploadProof(Request $request)
    {
        $user = $this->validateUser($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $request->validate([
            'transaction_id' => 'required|integer|exists:transactions,id',
            'proof' => 'required|image|max:5120', // Max 5MB
        ]);

        $transaction = Transaction::where('id', $request->transaction_id)
            ->where('user_id', $user->user_id)
            ->where('type', Transaction::TYPE_TOPUP)
            ->where('status', Transaction::STATUS_PENDING)
            ->first();

        if (!$transaction) {
            return response()->json(['error' => 'Transaction not found or not pending'], 404);
        }

        // Store proof
        $path = $request->file('proof')->store('payment_proofs', 'public');
        
        $transaction->update([
            'payment_proof' => $path,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Bukti transfer berhasil diupload. Menunggu verifikasi admin.',
            'proof_url' => asset('storage/' . $path),
        ]);
    }

    /**
     * Get transaction history.
     */
    public function history(Request $request)
    {
        $user = $this->validateUser($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $transactions = Transaction::where('user_id', $user->user_id)
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        return response()->json([
            'transactions' => $transactions->map(fn ($t) => [
                'id' => $t->id,
                'type' => $t->type,
                'amount' => $t->amount,
                'status' => $t->status,
                'payment_method' => $t->payment_method,
                'created_at' => $t->created_at,
                'description' => $t->admin_notes,
            ]),
        ]);
    }

    /**
     * Request withdrawal.
     */
    public function requestWithdrawal(Request $request)
    {
        $user = $this->validateUser($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $request->validate([
            'amount' => 'required|integer|min:' . config('botrate.withdrawal.min_amount') . '|max:' . config('botrate.withdrawal.max_amount'),
            'bank_name' => 'required|string|max:50',
            'bank_number' => 'required|string|max:50',
            'account_name' => 'required|string|max:100',
        ]);

        $amount = $request->amount;

        // Check balance
        if ($user->balance < $amount) {
            return response()->json(['error' => 'Saldo tidak cukup'], 400);
        }

        // Check if user is verified (if required)
        if (config('botrate.verification.required_for_withdrawal', true) && !$user->is_verified) {
            return response()->json(['error' => 'Akun belum terverifikasi. Silakan lakukan verifikasi terlebih dahulu.'], 403);
        }

        // Deduct balance immediately (will be refunded if rejected)
        $user->decrement('balance', $amount);
        $user->refresh();

        // Create withdrawal request
        $withdrawal = \App\Models\Withdrawal::create([
            'user_id' => $user->user_id,
            'amount' => $amount,
            'bank_name' => $request->bank_name,
            'bank_number' => $request->bank_number,
            'account_name' => $request->account_name,
            'status' => \App\Models\Withdrawal::STATUS_PENDING,
        ]);

        // Create transaction record
        Transaction::create([
            'user_id' => $user->user_id,
            'type' => Transaction::TYPE_WITHDRAWAL,
            'amount' => $amount,
            'status' => Transaction::STATUS_PENDING,
            'admin_notes' => "Withdrawal ke {$request->bank_name} a/n {$request->account_name}",
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Permohonan penarikan berhasil diajukan. Saldo Anda: RP ' . number_format($user->balance, 0, ',', '.'),
            'withdrawal_id' => $withdrawal->id,
        ]);
    }

    /**
     * Get withdrawal history.
     */
    public function withdrawalHistory(Request $request)
    {
        $user = $this->validateUser($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $withdrawals = \App\Models\Withdrawal::where('user_id', $user->user_id)
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        return response()->json([
            'withdrawals' => $withdrawals->map(fn ($w) => [
                'id' => $w->id,
                'amount' => $w->amount,
                'bank_name' => $w->bank_name,
                'bank_number' => $w->bank_number,
                'account_name' => $w->account_name,
                'status' => $w->status,
                'created_at' => $w->created_at,
            ]),
        ]);
    }

    /**
     * Verify KYC (submit verification documents).
     */
    public function verifyKyc(Request $request)
    {
        $user = $this->validateUser($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $request->validate([
            'document_type' => 'required|string|in:selfie,ktp,both',
            'selfie' => 'nullable|image|max:5120',
            'ktp' => 'nullable|image|max:5120',
        ]);

        $updates = ['verification_notes' => 'Document submitted: ' . $request->document_type];

        if ($request->hasFile('selfie')) {
            $updates['selfie_proof'] = $request->file('selfie')->store('verification', 'public');
        }

        if ($request->hasFile('ktp')) {
            $updates['ktp_proof'] = $request->file('ktp')->store('verification', 'public');
        }

        $user->update($updates);

        return response()->json([
            'success' => true,
            'message' => 'Dokumen verifikasi berhasil diupload. Menunggu persetujuan admin.',
        ]);
    }

    /**
     * Get payment instructions for each method.
     */
    protected function getPaymentInstructions(string $method, int $amount): string
    {
        return match ($method) {
            'ovo' => "Nomor OVO: 081234567890\nA/N: Admin BotRate",
            'dana' => "Nomor DANA: 081234567890\nA/N: Admin BotRate",
            'qris' => "QR Code:\n[Scan QR yang akan dikirim]\n\nAtau link: https://qr.is/YOUR_QR_LINK",
            'bca' => "Bank BCA: 1234567890\nA/N: Admin BotRate\n\nCabang: Jakarta",
        };
    }

    /**
     * Validate Telegram WebApp init data.
     */
    protected function validateUser(Request $request): ?User
    {
        $initData = $request->header('X-Telegram-Init-Data');
        if (!$initData) {
            return null;
        }

        parse_str($initData, $data);
        if (!isset($data['user'])) {
            return null;
        }

        $userData = json_decode($data['user'], true);
        if (!$userData || !isset($userData['id'])) {
            return null;
        }

        return User::find($userData['id']);
    }
}