# Bug Fix Summary - BotRate System

**Date:** 2026-04-09  
**Total Bugs Found:** 7  
**Status:** ✅ All Fixed

---

## Bug Details

### Bug 1: server.js - Environment Variable Mismatch (CRITICAL)
**File:** `server.js` (line 28)  
**Severity:** CRITICAL  
**Description:** Admin initialization used wrong environment variable name. Code used `ADMIN_USER_ID` but actual env var is `TELEGRAM_ADMIN_USER_ID`.

**Impact:** Admin user would never be initialized, breaking admin functionality from startup.

**Fix:**
```javascript
// Before:
const adminId = process.env.ADMIN_USER_ID;

// After:
const adminId = process.env.TELEGRAM_ADMIN_USER_ID;
```

---

### Bug 2: server.js - Incorrect User ID Property (CRITICAL)
**File:** `server.js` (line 76)  
**Severity:** CRITICAL  
**Description:** Security middleware referenced `req.user.id` but User model uses `user_id` as primary key.

**Impact:** Admin API endpoints would fail with undefined property errors, breaking admin access.

**Fix:**
```javascript
// Before:
console.warn(`[Security] Akses admin ilegal terdeteksi dari UserID: ${req.user ? req.user.id : 'Unknown'}`);

// After:
console.warn(`[Security] Akses admin ilegal terdeteksi dari UserID: ${req.user ? req.user.user_id : 'Unknown'}`);
```

---

### Bug 3: server.js - Non-Existent Column in Housekeeping (HIGH)
**File:** `server.js` (lines 173, 183)  
**Severity:** HIGH  
**Description:** Housekeeping query referenced `is_submitted` column which doesn't exist in `albums` table. Should filter by `status`.

**Impact:** Scheduled cleanup would fail, leaving expired drafts in database indefinitely.

**Fix:**
```sql
-- Before:
WHERE is_submitted = 0 AND created_at < DATE_SUB(NOW(), INTERVAL 14 DAY)

-- After:
WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 14 DAY)

-- And for the recalculation:
WHERE a.user_id = u.user_id AND a.status = 'approved'
```

---

### Bug 4: ModerationHandler.php - Custom Reject Cache Logic Broken (HIGH)
**File:** `app/Services/Telegram/Handlers/ModerationHandler.php` (lines 156, 184)  
**Severity:** HIGH  
**Description:** `handleRejectCustom()` stored cache with album ID in key but `handleCustomReasonText()` looked up pending album without using that ID, causing wrong album to be rejected or none at all.

**Impact:** Admin custom rejection feature would reject wrong media or fail silently.

**Fix:**
- Store album ID as value in cache: `Cache::put($cacheKey, ['album_id' => $albumId], 300)`
- Retrieve from cache using known pending key in `handleCustomReasonText()`
- Add proper album verification before processing

---

### Bug 5: src/handlers/webapp.js - Duplicate Function Definition (MEDIUM)
**File:** `src/handlers/webapp.js` (lines 214-233 & 154-178)  
**Severity:** MEDIUM  
**Description:** `updateMediaCaption()` function was defined twice in the same file. Second definition overwrote the first, but both had different error messages.

**Impact:** Minor - could cause confusion during maintenance. Functionality still worked.

**Fix:** Removed duplicate definition, kept the correct implementation.

---

### Bug 6: src/handlers/webapp.js - Non-Existent Column References (HIGH)
**File:** `src/handlers/webapp.js` (multiple lines)  
**Severity:** HIGH  
**Description:** Multiple database queries referenced `is_submitted` column that doesn't exist in `albums` table.

**Lines affected:**
- Line 30: `WHERE user_id = ? AND is_submitted = 1`
- Line 63: `WHERE user_id = ? AND is_submitted = 1`
- Line 100: `WHERE user_id = ? AND is_submitted = 0`
- Line 300: `WHERE is_submitted = 1 AND status = 'approved'`
- Line 386: `WHERE user_id = ? AND status = 'approved' AND is_submitted = 1`

**Impact:** All queries would fail with SQL errors, breaking profile, gallery, and search features.

**Fix:** Replaced all `is_submitted` references with proper `status` checks:
- For approved: `status = 'approved'`
- For pending: `status = 'pending'`
- For user's own albums: `status = 'approved'`

---

### Bug 7: TelegramBot::generateAnonymousId() - Truncation Bug (LOW)
**File:** `app/Services/Telegram/TelegramBot.php` (line 345)  
**Severity:** LOW  
**Description:** Generated random hex was truncated to 9 characters instead of using all 10. `bin2hex(random_bytes(5))` produces 10 hex chars, but `substr(..., 0, 9)` wasted 1 character and increased collision probability.

**Impact:** Slightly higher chance of anonymous ID collisions (still very low probability).

**Fix:**
```php
// Before:
$random = bin2hex(random_bytes(5));
return $prefix . strtoupper(substr($random, 0, 9));

// After:
$random = bin2hex(random_bytes(5));
return $prefix . strtoupper($random);
```

---

## Additional Notes

### Database Schema Mismatch
The codebase had widespread usage of a non-existent column `is_submitted` in the `albums` table. The actual schema uses `status` enum ('pending', 'approved', 'rejected') to track state. This was the most pervasive bug affecting nearly all database operations.

### Verified Database Schema
```sql
albums table:
- id (primary key)
- user_id (foreign key to users.user_id)
- status (enum: 'pending', 'approved', 'rejected')
- ... other columns
```

### Files Modified
1. `server.js` - 3 bugs fixed
2. `src/handlers/webapp.js` - 2 bugs fixed (duplicate function + is_submitted references)
3. `app/Services/Telegram/Handlers/ModerationHandler.php` - 1 bug fixed
4. `app/Services/Telegram/TelegramBot.php` - 1 bug fixed

---

**All bugs have been resolved. The system should now work correctly with the existing database schema.**