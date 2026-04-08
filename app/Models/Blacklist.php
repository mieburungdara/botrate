<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Blacklist extends Model
{
    protected $fillable = [
        'user_id',
        'reason',
        'banned_by',
    ];

    protected $casts = [
        'user_id' => 'bigint',
        'banned_by' => 'bigint',
        'created_at' => 'datetime',
    ];

    /**
     * Get the blacklisted user.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    /**
     * Get the admin who banned.
     */
    public function bannedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'banned_by', 'user_id');
    }
}