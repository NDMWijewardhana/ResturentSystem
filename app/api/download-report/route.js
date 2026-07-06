// @ts-nocheck
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

export async function POST(request) {
  try {
    const { month, fileName,branchId  } = await request.json()

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

    // Build summary per staff
    const summaryMap = {}
    const detailRows = []

    records.forEach(function(r) {
      const staff = staffRateMap[r.staff_id] || { name: 'Unknown', email: '', hourly_rate: 0, branch: 'Main' }
      const hours = r.total_minutes ? r.total_minutes / 60 : 0
      const pay = hours * staff.hourly_rate
      const clockIn = new Date(r.clock_in).toLocaleString('en-GB')
      const clockOut = r.clock_out ? new Date(r.clock_out).toLocaleString('en-GB') : '-'

      // Summary
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

      // Detail row
      detailRows.push({
        'Staff Name': staff.name,
        'Branch': staff.branch,
        'Clock In': clockIn,
        'Clock Out': clockOut,
        'Hours Worked': parseFloat(hours.toFixed(2)),
        'Hourly Rate' : staff.hourly_rate,
        'Pay ': parseFloat(pay.toFixed(2)),
        'Notes': r.notes || ''
      })
    })

    // Summary rows
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

    // Grand total row
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

    // Sheet 1 — Payroll Summary
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
    summarySheet['!cols'] = [
      { wch: 25 }, { wch: 30 }, { wch: 20 },
      { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }
    ]
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Payroll Summary (' + currency + ')')

    // Sheet 2 — Detailed Records
    const detailSheet = XLSX.utils.json_to_sheet(detailRows)
    detailSheet['!cols'] = [
      { wch: 25 }, { wch: 20 }, { wch: 22 },
      { wch: 22 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 30 }
    ]
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detailed Records')

    const excelBuffer = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })

    return NextResponse.json({ success: true, excel: excelBuffer })

  } catch (error) {
    console.log('Download report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}