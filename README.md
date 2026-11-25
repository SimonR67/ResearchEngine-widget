# Research Engine dashboard

Static dashboard for the SoftPapaya market and target tracker. Hosted on GitHub Pages.

- Sign-in: Google via Supabase Auth, restricted to one account. The database also enforces this with row level security, so the page itself holds no secrets.
- Data: Supabase schema `rmi` (watchlist, snapshots, signals, market_series, digests).
- `config.js` holds only the public Supabase URL and anon key. Never commit the service_role key.
- `vendor/supabase.js` is a pinned copy of supabase-js 2.119.2 (no third-party CDN at runtime).
