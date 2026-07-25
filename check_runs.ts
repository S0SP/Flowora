import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

supabase.from('workflow_runs').select('id, started_at, context').order('started_at', { ascending: false }).limit(2).then(res => {
  if (res.error) console.error(res.error);
  else console.log(JSON.stringify(res.data, null, 2));
});
