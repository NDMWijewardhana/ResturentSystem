import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  try {
    const { action, userId, updates } = await request.json()

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    if (action === 'deactivate') {
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: false })
        .eq('id', userId)

      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (action === 'activate') {
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: true })
        .eq('id', userId)

      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (action === 'update') {
      const { error } = await supabaseAdmin
        .from('profiles')
        .update(updates)
        .eq('id', userId)

      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (action === 'delete') {
      // Delete from auth (cascades to profile via foreign key)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (action === 'reset_password') {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: updates.newPassword
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}