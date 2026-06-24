import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { to, subject, html } = await request.json()

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Restaurant System <onboarding@resend.dev>',
        to,
        subject,
        html
      })
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json({ error: data }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}