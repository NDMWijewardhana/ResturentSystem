import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  try {
    const body = await request.json()
    const { email, password, full_name, role, branch_id, phone } = body

    console.log('Creating staff:', email)
    console.log('Service key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY is missing from .env.local' },
        { status: 500 }
      )
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: full_name, role: role }
    })

    if (userError) {
      console.log('User creation error:', userError)
      return NextResponse.json({ error: userError.message }, { status: 400 })
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        branch_id: branch_id,
        phone: phone,
        role: role,
        full_name: full_name
      })
      .eq('id', userData.user.id)

    if (profileError) {
      console.log('Profile update error:', profileError)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, user: userData.user })

  } catch (error) {
    console.log('CAUGHT ERROR:', error)
    return NextResponse.json(
      { error: error.message || 'Unknown error occurred' },
      { status: 500 }
    )
  }
}