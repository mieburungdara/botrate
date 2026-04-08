<?php

namespace App\Services\Telegram\Handlers;

use App\Models\User;
use App\Services\Telegram\TelegramBot;
use Illuminate\Support\Facades\DB;

class DonationHandler
{
    protected TelegramBot $bot;
    protected array $presetAmounts = [1000, 5000, 10000, 25000, 50000, 100000];

    public function __construct(TelegramBot $bot)
    {
        $this->bot = $bot;
    }

    /**
     * Handle donate button click from channel post.
     * Shows preset donation amounts to donor.
     */
    public function handleDonateRequest(array $callbackQuery, int $creatorUserId, string $albumToken): void
    {
        $callbackQueryId = $callbackQuery['id'];
        $donorId = $callbackQuery['from']['id'];

        // Answer callback immediately
        $this->bot->answerCallbackQuery($callbackQueryId);

        // Check if donor is trying to donate to themselves
        if ($donorId == $creatorUserId) {
            $this->bot->sendMessage($donorId, "❌ Anda tidak bisa berdonasi ke diri sendiri.");
            return;
        }

        // Find creator
        $creator = User::find($creatorUserId);
        if (!$creator) {
            $this->bot->sendMessage($donorId, "❌ Kreator tidak ditemukan.");
            return;
        }

        // Build donation keyboard with preset amounts
        $keyboard = $this->buildDonationKeyboard($creatorUserId, $albumToken);
        
        $this->bot->sendMessage(
            $donorId,
            "💝 <b>Donasi ke {$creator->anonymous_id}</b>\n\nPilih nominal donasi:\n\n" .
            "⚠️ Fee 10%: Creator menerima 90%\n" .
            "Contoh: RP 10.000 → Creator dapat RP 9.000\n\n" .
            "Atau ketik nominal custom (contoh: 15000)",
            $keyboard
        );
    }

    /**
     * Handle preset donation amount selection.
     */
    public function handleDonationPreset(array $callbackQuery, int $creatorUserId, int $amount, string $albumToken): void
    {
        $callbackQueryId = $callbackQuery['id'];
        $donorId = $callbackQuery['from']['id'];

        $this->processDonation($donorId, $creatorUserId, $amount, $albumToken, $callbackQueryId);
    }

    /**
     * Handle custom donation amount from user input.
     */
    public function handleDonationText(int $donorId, string $text, ?string $albumToken = null): void
    {
        // Validate amount
        $amount = (int) preg_replace('/[^0-9]/', '', $text);
        if ($amount < 1000) {
            $this->bot->sendMessage($donorId, "❌ Minimal donasi RP 1.000.");
            return;
        }

        if ($amount > 100000000) {
            $this->bot->sendMessage($donorId, "❌ Maksimal donasi RP 100.000.000.");
            return;
        }

        // Find creator from album token if provided
        $creatorUserId = null;
        if ($albumToken) {
            $album = \App\Models\Album::where('unique_token', $albumToken)->first();
            if ($album) {
                $creatorUserId = $album->user_id;
            }
        }

        if (!$creatorUserId) {
            $this->bot->sendMessage($donorId, "❌ Gagal memuat informasi kreator.");
            return;
        }

        $this->processDonation($donorId, $creatorUserId, $amount, $albumToken);
    }

    /**
     * Process donation (transfer balance).
     */
    protected function processDonation(int $donorId, int $creatorUserId, int $amount, ?string $albumToken, ?string $callbackQueryId = null): void
    {
        // Load donor and creator
        $donor = User::find($donorId);
        $creator = User::find($creatorUserId);

        if (!$donor || !$creator) {
            if ($callbackQueryId) {
                $this->bot->answerCallbackQuery($callbackQueryId, ['text' => '❌ User tidak ditemukan.', 'show_alert' => true]);
            } else {
                $this->bot->sendMessage($donorId, "❌ User tidak ditemukan.");
            }
            return;
        }

        // Check donor balance
        if ($donor->balance < $amount) {
            if ($callbackQueryId) {
                $this->bot->answerCallbackQuery($callbackQueryId, [
                    'text' => "❌ Saldo tidak cukup. Saldo Anda: RP " . number_format($donor->balance, 0, ',', '.'),
                    'show_alert' => true,
                ]);
            } else {
                $this->bot->sendMessage($donorId, "❌ Saldo tidak cukup. Saldo Anda: RP " . number_format($donor->balance, 0, ',', '.'));
            }
            return;
        }

        // Calculate fee (10%)
        $fee = (int) ($amount * 0.10);
        $creatorAmount = $amount - $fee;

        DB::beginTransaction();

        try {
            // Deduct from donor
            $donor->decrement('balance', $amount);
            $donor->refresh();

            // Add to creator
            $creator->increment('balance', $creatorAmount);
            $creator->refresh();

            // Create donation transaction (for donor)
            Transaction::create([
                'user_id' => $donorId,
                'type' => Transaction::TYPE_DONATION,
                'amount' => $amount,
                'status' => Transaction::STATUS_COMPLETED,
                'from_user_id' => $donorId,
                'to_user_id' => $creatorUserId,
                'admin_notes' => "Donasi ke {$creator->anonymous_id} (Fee 10%: RP {$fee})",
            ]);

            // Create purchase transaction (for creator)
            Transaction::create([
                'user_id' => $creatorUserId,
                'type' => Transaction::TYPE_PURCHASE,
                'amount' => $creatorAmount,
                'status' => Transaction::STATUS_COMPLETED,
                'from_user_id' => $donorId,
                'to_user_id' => $creatorUserId,
                'admin_notes' => "Donasi dari {$donor->anonymous_id} (Fee 10%: RP {$fee})",
            ]);

            DB::commit();

            // Notify donor
            $msgDonor = "✅ <b>Donasi Berhasil!</b>\n\n";
            $msgDonor .= "💝 Donasi: RP " . number_format($amount, 0, ',', '.') . "\n";
            $msgDonor .= "💰 Fee 10%: -RP " . number_format($fee, 0, ',', '.') . "\n";
            $msgDonor .= "📤 Dikirim ke: {$creator->anonymous_id}\n";
            $msgDonor .= "💳 Sisa saldo: RP " . number_format($donor->balance, 0, ',', '.');

            $this->bot->sendMessage($donorId, $msgDonor);

            // Notify creator
            $msgCreator = "🎉 <b>Donasi Masuk!</b>\n\n";
            $msgCreator .= "💝 Dari: {$donor->anonymous_id}\n";
            $msgCreator .= "💵 Jumlah: RP " . number_format($amount, 0, ',', '.') . "\n";
            $msgCreator .= "💰 Diterima: RP " . number_format($creatorAmount, 0, ',', '.') . "\n";
            $msgCreator .= "💳 Saldo Anda: RP " . number_format($creator->balance, 0, ',', '.');

            $this->bot->sendMessage($creatorUserId, $msgCreator);

            // Answer callback
            if ($callbackQueryId) {
                $this->bot->answerCallbackQuery($callbackQueryId, [
                    'text' => "✅ Donasi RP " . number_format($amount, 0, ',', '.') . " berhasil!",
                    'show_alert' => true,
                ]);
            }

        } catch (\Exception $e) {
            DB::rollBack();
            if ($callbackQueryId) {
                $this->bot->answerCallbackQuery($callbackQueryId, [
                    'text' => '❌ Gagal memproses donasi. Coba lagi.',
                    'show_alert' => true,
                ]);
            } else {
                $this->bot->sendMessage($donorId, "❌ Gagal memproses donasi.");
            }
        }
    }

    /**
     * Build donation keyboard with preset amounts.
     */
    protected function buildDonationKeyboard(int $creatorUserId, string $albumToken): array
    {
        $buttons = [];
        foreach ($this->presetAmounts as $amount) {
            $formatted = number_format($amount, 0, ',', '.');
            $buttons[] = [$this->bot->callbackButton("RP {$formatted}", "donate_{$creatorUserId}_{$amount}_{$albumToken}")];
        }
        // Add custom amount button
        $buttons[] = [$this->bot->callbackButton('💰 Nominal Lain (ketik manual)', "donate_custom_{$creatorUserId}_{$albumToken}")];

        return $this->bot->buildInlineKeyboard($buttons);
    }
}