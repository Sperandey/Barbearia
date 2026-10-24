window.BARBER_SUPABASE_CONFIG = {
  url: 'https://dwyjmlcnvprmfmejqlzc.supabase.co',
  publishableKey: 'sb_publishable_VBImtvhEiwgkt3xMsFuz4w_j_5t5bJP'
};

window.barberSupabase = window.supabase?.createClient(
  window.BARBER_SUPABASE_CONFIG.url,
  window.BARBER_SUPABASE_CONFIG.publishableKey,
  {
    realtime: { params: { eventsPerSecond: 5 } },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }
) || null;
