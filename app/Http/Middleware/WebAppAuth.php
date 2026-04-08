<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class WebAppAuth
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $initData = $request->header('X-Telegram-Init-Data');

        if (!$initData) {
            abort(401, 'Unauthorized');
        }

        // Parse and validate init data
        parse_str($initData, $data);

        if (!isset($data['user'])) {
            abort(401, 'Invalid init data');
        }

        return $next($request);
    }
}