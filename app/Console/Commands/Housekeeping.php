<?php

namespace App\Console\Commands;

use App\Models\Album;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class Housekeeping extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'botrate:housekeeping';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Clean up expired draft albums and recalculate user stats';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $this->info('Starting housekeeping...');

        // Delete expired drafts (older than 14 days)
        $days = config('botrate.housekeeping.draft_expiry_days', 14);
        $cutoff = now()->subDays($days);

        $expiredAlbums = Album::where('status', Album::STATUS_PENDING)
            ->where('created_at', '<', $cutoff)
            ->get();

        $count = $expiredAlbums->count();

        if ($count === 0) {
            $this->info('No expired drafts to clean.');
            return Command::SUCCESS;
        }

        // Get user IDs for recalculation
        $userIds = $expiredAlbums->pluck('user_id')->unique();

        // Delete expired albums
        $expiredAlbums->each(function ($album) {
            Log::info('Housekeeping: Deleting expired draft', [
                'album_id' => $album->id,
                'user_id' => $album->user_id,
                'created_at' => $album->created_at,
            ]);
        });

        Album::where('status', Album::STATUS_PENDING)
            ->where('created_at', '<', $cutoff)
            ->delete();

        $this->info("Deleted {$count} expired draft(s).");

        // Recalculate album_count for affected users
        foreach ($userIds as $userId) {
            $count = Album::where('user_id', $userId)->count();
            DB::table('users')
                ->where('user_id', $userId)
                ->update(['album_count' => $count]);
        }

        $this->info('Recalculated album_count for ' . $userIds->count() . ' user(s).');
        $this->info('Housekeeping complete.');

        return Command::SUCCESS;
    }
}