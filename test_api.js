const http = require('http');

async function run() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient('https://kgdlmgtslhjpytncxwzw.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZGxtZ3RzbGhqcHl0bmN4d3p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzU2NTgsImV4cCI6MjA5ODMxMTY1OH0.ec17OHaRaTsXtMbvoWnC51b6mkRRy4OBIqsvyu3mgwA', {
      auth: { persistSession: false }
    });
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email: 'sumit.chourasia.it28@heritageit.edu.in', password: 'Sumit700@32' });
    if (authErr) throw authErr;

    const sbCookieName = 'sb-kgdlmgtslhjpytncxwzw-auth-token';
    const cookieVal = encodeURIComponent(JSON.stringify([
      authData.session.access_token,
      authData.session.refresh_token,
      null, null, null
    ]));
    const cookie = `${sbCookieName}=${cookieVal}; fw_ws=047d783a-68d2-4e5a-8788-c52a7b5756dd`;

    console.log("Cookie:", cookie);

    const res = await fetch('http://localhost:3000/api/inbox/threads', {
      headers: {
        'Cookie': cookie
      }
    });

    const body = await res.text();
    console.log('STATUS:', res.status);
    console.log('BODY:', body);

  } catch (err) {
    console.error(err);
  }
}
run();
