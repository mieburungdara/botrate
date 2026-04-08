<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->index();
            $table->enum('type', ['topup', 'donation', 'purchase', 'withdrawal']);
            $table->decimal('amount', 15, 2);
            $table->enum('status', ['pending', 'completed', 'failed', 'cancelled']);
            $table->string('payment_method')->nullable();
            $table->string('payment_proof')->nullable();
            $table->string('reference_id')->nullable()->unique();
            $table->unsignedBigInteger('from_user_id')->nullable()->index();
            $table->unsignedBigInteger('to_user_id')->nullable()->index();
            $table->text('admin_notes')->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('user_id')->on('users')->onDelete('cascade');
            $table->foreign('from_user_id')->references('user_id')->on('users')->onDelete('set null');
            $table->foreign('to_user_id')->references('user_id')->on('users')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};