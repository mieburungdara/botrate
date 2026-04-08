<?php

use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| Console Routes
|--------------------------------------------------------------------------
*/

// Housekeeping - cleanup expired drafts
Schedule::command('botrate:housekeeping')->daily();