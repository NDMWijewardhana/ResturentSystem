import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

export async function POST(request) {
  try {
    const { month,fileName } = await request.json()

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const [year, monthNum] = month.split('-')
    const startDate = `${year}-${monthNum}-01`
    const lastDay = new Date(year, monthNum, 0).getDate()
    const endDate = `${year}-${monthNum}-${lastDay}`

    const { data: records, error } = await supabaseAdmin
      .from('time_records')
      .select('*, staff:profiles!time_records_staff_id_fkey(full_name, email, branch:branches(name))')
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
      const name = r.staff?.full_name || 'Unknown'
      const staffEmail = r.staff?.email || ''
      const branch = r.staff?.branch?.name || 'Main Branch'
      const hours = r.total_minutes ? (r.total_minutes / 60).toFixed(2) : '0'
      const clockIn = new Date(r.clock_in).toLocaleString('en-GB')
      const clockOut = r.clock_out ? new Date(r.clock_out).toLocaleString('en-GB') : '-'

      if (!summaryMap[name]) {
        summaryMap[name] = { name, email: staffEmail, branch, totalMinutes: 0, shifts: 0 }
      }
      summaryMap[name].totalMinutes += r.total_minutes || 0
      summaryMap[name].shifts += 1

      detailRows.push({
        'Staff Name': name,
        'Branch': branch,
        'Clock In': clockIn,
        'Clock Out': clockOut,
        'Hours Worked': parseFloat(hours),
        'Notes': r.notes || ''
      })
    })

    const summaryRows = Object.values(summaryMap).map(function(s) {
      return {
        'Staff Name': s.name,
        'Email': s.email,
        'Branch': s.branch,
        'Total Shifts': s.shifts,
        'Total Hours': parseFloat((s.totalMinutes / 60).toFixed(2)),
        'Total Minutes': s.totalMinutes
      }
    })

    // Create workbook
    const workbook = XLSX.utils.book_new()

    const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
    summarySheet['!cols'] = [
      { wch: 25 }, { wch: 30 }, { wch: 20 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }
    ]
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

    const detailSheet = XLSX.utils.json_to_sheet(detailRows)
    detailSheet['!cols'] = [
      { wch: 25 }, { wch: 20 }, { wch: 22 },
      { wch: 22 }, { wch: 15 }, { wch: 30 }
    ]
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detailed Records')

    const excelBuffer = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })

    return NextResponse.json({ success: true, excel: excelBuffer })

  } catch (error) {
    console.log('Download report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}