<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('albums', function (Blueprint $table) {
            $table->id();
            $table->bigInteger('user_id');
            $table->json('message_ids');
            $table->json('media_items'); // Array of {type, file_id}
            $table->bigInteger('chat_id');
            $table->text('caption')->nullable();
            $table->string('unique_token', 32)->unique();
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->bigInteger('moderator_message_id')->nullable();
            $table->string('reject_reason', 100)->nullable();
            $table->integer('download_count')->default(0);
            $table->integer('rating_count')->default(0);
            $table->integer('rating_total')->default(0);
            $table->decimal('rating_avg', 3, 2)->default(0.00);
            $table->bigInteger('channel_message_id')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();

            $table->foreign('user_id')->references('user_id')->on('users')->onDelete('cascade');
            $table->index('unique_token');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('albums');
    }
};