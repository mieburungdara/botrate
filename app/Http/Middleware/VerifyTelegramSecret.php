<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyTelegramSecret
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $secret = $request->header('X-Telegram-Bot-API-Secret-Token');
        $expectedSecret = config('telegram.webhook_secret');

        if ($expectedSecret && $secret !== $expectedSecret) {
            abort(403, 'Forbidden');
        }

        return $next($request);
    }
}