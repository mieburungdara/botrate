<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class User extends Model
{
    protected $primaryKey = 'user_id';
    public $incrementing = false;
    protected $keyType = 'bigint';

    protected $fillable = [
        'user_id',
        'username',
        'first_name',
        'last_name',
        'is_admin',
        'anonymous_id',
        'is_public',
        'last_active',
        'album_count',
        'download_count',
        'balance',
        'is_verified',
        'bank_name',
        'bank_number',
        'account_name',
        'verification_notes',
    ];

    protected $casts = [
        'user_id' => 'bigint',
        'is_admin' => 'boolean',
        'is_public' => 'boolean',
        'last_active' => 'datetime',
        'album_count' => 'integer',
        'download_count' => 'integer',
        'balance' => 'decimal:2',
        'is_verified' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Get the full name attribute.
     */
    public function getFullNameAttribute(): string
    {
        return trim(($this->first_name ?? '') . ' ' . ($this->last_name ?? ''));
    }

    /**
     * Get albums by this user.
     */
    public function albums(): HasMany
    {
        return $this->hasMany(Album::class, 'user_id', 'user_id');
    }

    /**
     * Get ratings by this user.
     */
    public function ratings(): HasMany
    {
        return $this->hasMany(Rating::class, 'user_id', 'user_id');
    }

    /**
     * Get blacklist entry.
     */
    public function blacklist(): HasOne
    {
        return $this->hasOne(Blacklist::class, 'user_id', 'user_id');
    }

    /**
     * Check if user is blacklisted.
     */
    public function isBlacklisted(): bool
    {
        return $this->blacklist()->exists();
    }

    /**
     * Check if user is admin.
     */
    public function isAdmin(): bool
    {
        return $this->is_admin === true;
    }

    /**
     * Get transactions by this user.
     */
    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class, 'user_id', 'user_id');
    }

    /**
     * Get withdrawal requests by this user.
     */
    public function withdrawals(): HasMany
    {
        return $this->hasMany(Withdrawal::class, 'user_id', 'user_id');
    }

    /**
     * Check if user can withdraw.
     */
    public function canWithdraw(): bool
    {
        return $this->is_verified && $this->balance >= 10000.00;
    }

    /**
     * Check if user has sufficient balance.
     */
    public function hasSufficientBalance(float $amount): bool
    {
        return $this->balance >= $amount;
    }
}