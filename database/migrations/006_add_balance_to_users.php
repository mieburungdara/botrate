<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->decimal('balance', 15, 2)->default(0)->after('download_count');
            $table->boolean('is_verified')->default(false)->after('balance');
            $table->string('bank_name')->nullable()->after('is_verified');
            $table->string('bank_number')->nullable()->after('bank_name');
            $table->string('account_name')->nullable()->after('bank_number');
            $table->text('verification_notes')->nullable()->after('account_name');
            $table->string('selfie_proof')->nullable()->after('verification_notes');
            $table->string('ktp_proof')->nullable()->after('selfie_proof');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['balance', 'is_verified', 'bank_name', 'bank_number', 'account_name', 'verification_notes', 'selfie_proof', 'ktp_proof']);
        });
    }
};