import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: members, error } = await supabase
    .from('workspace_members')
    .select('id, user_id, workspace_id, role, status')

  console.log('Members:', JSON.stringify(members, null, 2))
  if (error) console.error('Error:', error)
}

main()
