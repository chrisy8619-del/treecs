import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { data, error } = await supabase
    .from('species_substitutions')
    .select(`
      id,
      original_species_id,
      substitute_species_id,
      improved_defect_rate,
      original:original_species_id ( species_name_ko ),
      substitute:substitute_species_id ( species_name_ko )
    `)

  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}
