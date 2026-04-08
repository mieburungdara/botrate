<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Album extends Model
{
    protected $fillable = [
        'user_id',
        'message_ids',
        'media_items',
        'chat_id',
        'caption',
        'unique_token',
        'status',
        'moderator_message_id',
        'reject_reason',
        'download_count',
        'rating_count',
        'rating_total',
        'rating_avg',
        'channel_message_id',
        'approved_at',
        'rejected_at',
    ];

    protected $casts = [
        'user_id' => 'bigint',
        'message_ids' => 'array',
        'media_items' => 'array',
        'chat_id' => 'bigint',
        'moderator_message_id' => 'bigint',
        'download_count' => 'integer',
        'rating_count' => 'integer',
        'rating_total' => 'integer',
        'rating_avg' => 'decimal:2',
        'channel_message_id' => 'bigint',
        'approved_at' => 'datetime',
        'rejected_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    /**
     * Status constants.
     */
    const STATUS_PENDING = 'pending';
    const STATUS_APPROVED = 'approved';
    const STATUS_REJECTED = 'rejected';

    /**
     * Get the user who submitted this album.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    /**
     * Get ratings for this album.
     */
    public function ratings(): HasMany
    {
        return $this->hasMany(Rating::class, 'album_id', 'id');
    }

    /**
     * Get downloads for this album.
     */
    public function downloads(): HasMany
    {
        return $this->hasMany(Download::class, 'album_id', 'id');
    }

    /**
     * Scope for pending albums.
     */
    public function scopePending($query)
    {
        return $query->where('status', self::STATUS_PENDING);
    }

    /**
     * Scope for approved albums.
     */
    public function scopeApproved($query)
    {
        return $query->where('status', self::STATUS_APPROVED);
    }

    /**
     * Check if album is pending.
     */
    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    /**
     * Check if album is approved.
     */
    public function isApproved(): bool
    {
        return $this->status === self::STATUS_APPROVED;
    }

    /**
     * Check if album is rejected.
     */
    public function isRejected(): bool
    {
        return $this->status === self::STATUS_REJECTED;
    }

    /**
     * Get media items.
     */
    public function getMediaItems(): array
    {
        return $this->media_items ?? [];
    }

    /**
     * Get visual media (photo/video).
     */
    public function getVisualMedia(): array
    {
        return array_filter($this->getMediaItems(), function ($item) {
            return in_array($item['type'], ['photo', 'video']);
        });
    }

    /**
     * Get documents.
     */
    public function getDocuments(): array
    {
        return array_filter($this->getMediaItems(), function ($item) {
            return $item['type'] === 'document';
        });
    }
}