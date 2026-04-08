<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Download extends Model
{
    protected $fillable = [
        'album_id',
        'user_id',
    ];

    protected $casts = [
        'album_id' => 'bigint',
        'user_id' => 'bigint',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Get the album this download belongs to.
     */
    public function album(): BelongsTo
    {
        return $this->belongsTo(Album::class, 'album_id', 'id');
    }

    /**
     * Get the user who downloaded.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }
}