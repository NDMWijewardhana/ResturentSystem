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
      // Log the error but don't crash the app
      console.log('Email not sent (expected during testing):', data.message)
      return NextResponse.json({ 
        success: false, 
        warning: 'Email could not be sent. This is normal during testing with Resend free tier.' 
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.log('Email error:', error.message)
    return NextResponse.json({ success: false, warning: error.message })
  }
}