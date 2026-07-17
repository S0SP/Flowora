const fs = require('fs');
const envText = fs.readFileSync('.env', 'utf8');
envText.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data, error } = await supabase.from('custom_field_schemas').select('*').limit(1);
  if (error) {
    console.log('ERROR:', error);
  } else {
    console.log('SUCCESS:', data);
  }
}

test();
