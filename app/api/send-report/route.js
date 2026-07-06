import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

export async function POST(request) {
  try {
    const { month, email, fileName,branchId  } = await request.json()

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const [year, monthNum] = month.split('-')
    const startDate = `${year}-${monthNum}-01`
    const lastDay = new Date(year, monthNum, 0).getDate()
    const endDate = `${year}-${monthNum}-${lastDay}`

    // Get currency setting
    const { data: currencyData } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'currency')
      .single()

    const currency = currencyData?.value || 'EUR'

    // Get all staff with hourly rates
    const { data: staffProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, hourly_rate, branch:branches(name)')

    const staffRateMap = {}
    ;(staffProfiles || []).forEach(function(s) {
      staffRateMap[s.id] = {
        name: s.full_name,
        email: s.email,
        hourly_rate: s.hourly_rate || 0,
        branch: s.branch?.name || 'Main Branch'
      }
    })

    // Get time records
    const { data: records, error } = await supabaseAdmin
      .from('time_records')
      .select('*')
      .gte('clock_in', startDate)
      .lte('clock_in', endDate + 'T23:59:59')
      .not('clock_out', 'is', null)
      .order('clock_in')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Build summary
    const summaryMap = {}
    const detailRows = []

    records.forEach(function(r) {
      const staff = staffRateMap[r.staff_id] || { name: 'Unknown', email: '', hourly_rate: 0, branch: 'Main' }
      const hours = r.total_minutes ? r.total_minutes / 60 : 0
      const pay = hours * staff.hourly_rate
      const clockIn = new Date(r.clock_in).toLocaleString('en-GB')
      const clockOut = r.clock_out ? new Date(r.clock_out).toLocaleString('en-GB') : '-'

      if (!summaryMap[r.staff_id]) {
        summaryMap[r.staff_id] = {
          name: staff.name,
          email: staff.email,
          branch: staff.branch,
          hourly_rate: staff.hourly_rate,
          totalMinutes: 0,
          totalPay: 0,
          shifts: 0
        }
      }
      summaryMap[r.staff_id].totalMinutes += r.total_minutes || 0
      summaryMap[r.staff_id].totalPay += pay
      summaryMap[r.staff_id].shifts += 1

      detailRows.push({
        'Staff Name': staff.name,
        'Branch': staff.branch,
        'Clock In': clockIn,
        'Clock Out': clockOut,
        'Hours Worked': parseFloat(hours.toFixed(2)),
        'Hourly Rate ': staff.hourly_rate,
        'Pay ': parseFloat(pay.toFixed(2)),
        'Notes': r.notes || ''
      })
    })

    const summaryRows = Object.values(summaryMap).map(function(s) {
      const totalHours = s.totalMinutes / 60
      return {
        'Staff Name': s.name,
        'Email': s.email,
        'Branch': s.branch,
        'Total Shifts': s.shifts,
        'Total Hours': parseFloat(totalHours.toFixed(2)),
        'Hourly Rate ': s.hourly_rate,
        'Total Pay ': parseFloat(s.totalPay.toFixed(2))
      }
    })

    // Grand total
    const grandTotalHours = Object.values(summaryMap).reduce((sum, s) => sum + s.totalMinutes, 0) / 60
    const grandTotalPay = Object.values(summaryMap).reduce((sum, s) => sum + s.totalPay, 0)

    summaryRows.push({
      'Staff Name': 'TOTAL',
      'Email': '',
      'Branch': '',
      'Total Shifts': Object.values(summaryMap).reduce((sum, s) => sum + s.shifts, 0),
      'Total Hours': parseFloat(grandTotalHours.toFixed(2)),
      'Hourly Rate ': '',
      'Total Pay ': parseFloat(grandTotalPay.toFixed(2))
    })

    // Create workbook
    const workbook = XLSX.utils.book_new()

    const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
    summarySheet['!cols'] = [
      { wch: 25 }, { wch: 30 }, { wch: 20 },
      { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }
    ]
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Payroll Summary (' + currency + ')')

    const detailSheet = XLSX.utils.json_to_sheet(detailRows)
    detailSheet['!cols'] = [
      { wch: 25 }, { wch: 20 }, { wch: 22 },
      { wch: 22 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 30 }
    ]
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detailed Records')

    const excelBuffer = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })

    // Format month label
    const monthLabel = new Date(year, monthNum - 1).toLocaleString('en-GB', {
      month: 'long', year: 'numeric'
    })

    // Send email
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Restaurant System <onboarding@resend.dev>',
        to: email,
        subject: `Payroll Report — ${monthLabel}`,
        html: `
          <h2>Payroll Report — ${monthLabel}</h2>
          <p>Please find attached the payroll report for <strong>${monthLabel}</strong>.</p>
          <h3>Summary</h3>
          <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
            <tr style="background:#f3f4f6">
              <th>Staff Name</th>
              <th>Branch</th>
              <th>Total Hours</th>
              <th>Hourly Rate</th>
              <th>Total Pay</th>
            </tr>
            ${summaryRows.filter(r => r['Staff Name'] !== 'TOTAL').map(function(r) {
              return `<tr>
                <td>${r['Staff Name']}</td>
                <td>${r['Branch']}</td>
                <td>${r['Total Hours']}</td>
                <td>${currency} ${r['Hourly Rate (' + currency + ')']}</td>
                <td>${currency} ${r['Total Pay (' + currency + ')']}</td>
              </tr>`
            }).join('')}
            <tr style="background:#f3f4f6;font-weight:bold">
              <td colspan="2">TOTAL</td>
              <td>${parseFloat(grandTotalHours.toFixed(2))}</td>
              <td></td>
              <td>${currency} ${parseFloat(grandTotalPay.toFixed(2))}</td>
            </tr>
          </table>
          <p style="color:#6b7280;font-size:12px;margin-top:24px;">
            Generated by Restaurant System
          </p>
        `,
        attachments: [
          {
            filename: (fileName || 'payroll-report') + '-' + month + '.xlsx',
            content: excelBuffer
          }
        ]
      })
    })

    const resendData = await resendResponse.json()

    if (!resendResponse.ok) {
      return NextResponse.json({
        success: false,
        warning: 'Report generated but email failed: ' + (resendData.message || 'Unknown error'),
        excel: excelBuffer
      })
    }

    return NextResponse.json({
      success: true,
      excel: excelBuffer,
      summary: summaryRows
    })

  } catch (error) {
    console.log('Report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}