// Public values only. The anon key is designed to be public: the database rules
// (row level security) allow nothing unless you are signed in as the owner.
// NEVER put the service_role key here.
window.RE_CONFIG = {
  supabaseUrl: "https://oixbkclczqzgqltkmive.supabase.co",
  supabaseAnonKey: "sb_publishable_gxuZxsi2dRpKmij1-Vb1wg_Ulw57rmt",
  ownerEmail: "simon.r@softpapaya.com"
};
