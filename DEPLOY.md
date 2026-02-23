# TSCQS — Deployment Checklist

Keep this file updated as the project grows. Work through it top-to-bottom before every production deploy.

---

## 1. Environment Variables

Set all of these in **Vercel → Project → Settings → Environment Variables**.
Also keep a local copy in `.env.local` (never commit that file).

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL — safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key — safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Secret.** Used by all `supabaseAdmin` calls in API routes. Never expose client-side. |
| `NEXT_PUBLIC_APP_URL` | Yes | Production root URL, no trailing slash. e.g. `https://app.yourdomain.com`. Used in invite emails, password-reset links, and auth callbacks. |
| `CRON_SECRET` | Yes | Any long random string. Vercel injects it as `Authorization: Bearer <secret>` when calling cron routes. Generate one with `openssl rand -hex 32`. |

---

## 2. Supabase Project Settings

### Auth → URL Configuration
- **Site URL** → set to your production `NEXT_PUBLIC_APP_URL`
- **Redirect URLs** → add:
  - `https://app.yourdomain.com/auth/callback`
  - `https://app.yourdomain.com/auth/reset-password`

### Auth → Email Templates
Supabase sends invite and password-reset emails using these templates.
Confirm the default templates look acceptable, or customise them before launch.

### Auth → SMTP Settings
The app sends two types of email:
- **Associate invites** — triggered by `supabaseAdmin.auth.admin.inviteUserByEmail()`
- **Password reset** — triggered by `supabase.auth.resetPasswordForEmail()`

Both go through Supabase Auth's configured SMTP provider.

- [ ] Configure SMTP (Supabase built-in is rate-limited; use SES, SendGrid, or Postmark for production)
- [ ] Send a test invite to verify delivery and link formatting
- [ ] Send a test password-reset to verify the `/auth/reset-password` redirect works

### Auth → Email OTP Expiry
Default is 24 hours for invite links. Adjust under **Auth → Settings → OTP Expiry** if needed.

---

## 3. Database Migrations

All migrations must be run on the **production** Supabase project in order, via the SQL editor.

| # | File | What it does |
|---|---|---|
| 001 | `001_foundation.sql` | Companies, locations, profiles, company_members |
| 002 | `002_departments_positions.sql` | Departments, positions |
| 003 | `003_associates.sql` | Associates table |
| 004 | `004_ninety_day.sql` | 90-day review structure |
| 005 | `005_checkins.sql` | check_ins table |
| 006 | `006_reviews.sql` | Reviews |
| 007 | `007_progression.sql` | Progression tracking |
| 008 | `008_assessments.sql` | Assessments |
| 009 | `009_incidents.sql` | Incidents |
| 010 | `010_succession_push.sql` | Succession |
| 011 | `011_seed_milestones.sql` | Milestone seeds |
| 012 | `012_seed_defaults.sql` | Default seeds |
| 013 | `013_progression_assessment_link.sql` | Progression ↔ assessment link |
| 014 | `014_associate_email_invite_trigger.sql` | Invite trigger — links auth user to associate row |
| 015 | `015_location_details.sql` | Location detail fields |
| 016 | `016_seed_positions.sql` | Position seeds |
| 017 | `017_location_suite_zip.sql` | Location address fields |
| 018 | `018_location_logo.sql` | Location logo_url |
| 019 | `019_stations.sql` | Stations |
| 020 | `020_checkin_system.sql` | Full check-in system (prompts, self-assessments) |
| 021 | `021_profile_contact.sql` | Profile contact fields |
| 022 | `022_checkin_flags.sql` | Flag system (flagged, flag_reasons, concern_keywords, concern_tags) |
| 023 | `023_alert_settings.sql` | Alert settings table + seed defaults |
| 024 | `024_checkin_review.sql` | reviewed_at, review_note on check_ins |
| 025 | `025_get_auth_user_by_email.sql` | Helper function for invite-resend flow |
| 026 | `026_checkin_cadence_engine.sql` | type column, supervisor_id nullable, generate_scheduled_checkins() |

---

## 4. Vercel Cron Jobs

After deploying, verify the cron is registered:
**Vercel Dashboard → Project → Settings → Cron Jobs**

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/schedule-checkins` | `0 6 * * *` (6:00 UTC daily) | Generates 30/60/90-day and annual scheduled check-in rows |

To test manually after deploy (replace values):
```
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://app.yourdomain.com/api/cron/schedule-checkins
```
Expected response: `{ "ok": true, "result": { "created": N, "skipped": N } }`

---

## 5. Pre-Launch Verification

Work through these manually before opening to users:

- [ ] Owner signup → onboarding → company + location created
- [ ] Add associate → invite email arrives → associate accepts → lands on dashboard
- [ ] Forgot password → email arrives → reset link works → lands on dashboard
- [ ] Supervisor dashboard shows team table with "Last check-in" column
- [ ] Cron route returns `ok: true` (confirms DB function is deployed)
- [ ] Complete a check-in → flagged check-in appears in "Needs follow-up"
- [ ] Mark flagged check-in as reviewed → disappears from dashboard
- [ ] Alert settings page saves without error

---

## 6. Post-Launch

- Set `CRON_SECRET` if not already done — the cron is open to unauthenticated calls in development but enforced in production only when the secret is present
- Monitor Vercel logs for `[cron/schedule-checkins]` entries each morning
- Monitor Supabase logs for any RLS policy errors (Auth → Logs)
