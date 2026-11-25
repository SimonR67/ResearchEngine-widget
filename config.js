// Public values only. The anon key is designed to be public: the database rules
// (row level security) allow nothing unless you are signed in as the owner.
// NEVER put the service_role key here.
window.RE_CONFIG = {
  supabaseUrl: "PASTE_SUPABASE_PROJECT_URL",
  supabaseAnonKey: "PASTE_SUPABASE_ANON_PUBLIC_KEY",
  ownerEmail: "simon.r@softpapaya.com"
};
