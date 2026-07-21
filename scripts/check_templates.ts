import { createClient } from "@supabase/supabase-js";
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data, error } = await supabase.from('message_templates').select('*');
  console.log('Error:', error);
  console.log('Templates in DB:', JSON.stringify(data, null, 2));
}

check();
