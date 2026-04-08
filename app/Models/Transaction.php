<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Transaction extends Model
{
    use HasFactory;

    const TYPE_TOPUP = 'topup';
    const TYPE_DONATION = 'donation';
    const TYPE_PURCHASE = 'purchase';
    const TYPE_WITHDRAWAL = 'withdrawal';

    const STATUS_PENDING = 'pending';
    const STATUS_COMPLETED = 'completed';
    const STATUS_FAILED = 'failed';
    const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'user_id',
        'type',
        'amount',
        'status',
        'payment_method',
        'payment_proof',
        'reference_id',
        'from_user_id',
        'to_user_id',
        'admin_notes',
    ];

    protected $casts = [
        'user_id' => 'bigint',
        'from_user_id' => 'bigint',
        'to_user_id' => 'bigint',
        'amount' => 'decimal:2',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    public function fromUser()
    {
        return $this->belongsTo(User::class, 'from_user_id', 'user_id');
    }

    public function toUser()
    {
        return $this->belongsTo(User::class, 'to_user_id', 'user_id');
    }
}