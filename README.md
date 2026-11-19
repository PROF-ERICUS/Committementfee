# Youth Parliament Ghana — Presidential Appointees Sash Registration

Starter web app: HTML, CSS, JavaScript, Supabase database, private receipt storage, Supabase Edge Function.

## Included
- Public registration form: first name, middle name (optional), surname, position, receipt file
- No username field or username generation; sash names use first name, optional middle name, and last name
- Receipt upload accepts JPG/PNG/PDF up to 5 MB
- Registration always starts as `pending`; public client cannot approve it
- Admin sign-in with Supabase Auth, receipt preview through short-lived signed links, status actions
- Approved/printed CSV export

## Setup
1. Create a Supabase project.
2. In SQL Editor, run `supabase/schema.sql`.
3. Create an admin user in Supabase Authentication → Users (invite or create).
4. Copy the admin user's UUID and run the insert statement in `schema.sql` with that UUID in `public.ypg_sash_admins`.
5. In `config.js`, set your Supabase project URL and anon/public key. Never put the service-role key in frontend files.
6. Deploy the Edge Function from the Supabase CLI:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy register-sash
   ```
   Ensure Edge Function secrets include `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (provided by the Supabase project environment; the service key is server-side only).
7. Open `index.html` for public registration and `admin.html` for admin access. For production, host on a static site provider with HTTPS (Netlify, Vercel, Cloudflare Pages, etc.).

## Important security notes before production
- Add CAPTCHA and rate limiting to the registration Edge Function to prevent spam.
- Configure CORS to your production domain instead of `*`.
- Do not expose service-role secrets in `config.js` or any browser code.
- Admin users must be added to `ypg_sash_admins`.
- This system verifies receipts manually; uploading is not payment approval.
- The admin review action currently changes statuses. Add a server-side audit log if a full review history is required.
