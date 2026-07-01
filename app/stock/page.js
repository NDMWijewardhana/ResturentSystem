// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function StockPage() {
  const [profile, setProfile] = useState(null)
  const [stockItems, setStockItems] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('items')
  const [searchQuery, setSearchQuery] = useState('')

  const [form, setForm] = useState({
    stock_item_id: '',
    quantity_requested: '',
    urgency: 'normal',
    notes: ''
  })

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*, branch:branches(name)')
      .eq('id', user.id)
      .single()

    setProfile(profileData)

    // Load stock items
    const { data: itemsData } = await supabase
      .from('stock_items')
      .select('*')
      .order('category')
      .order('name')

    setStockItems(itemsData || [])

    // Load own requests
    const { data: requestsData } = await supabase
      .from('stock_requests')
      .select('*, item:stock_items(name, unit, category)')
      .eq('staff_id', user.id)
      .order('created_at', { ascending: false })

    setRequests(requestsData || [])
    setLoading(false)
  }

async function handleSubmit(e) {
  e.preventDefault()
  setSaving(true)
  setError('')

  if (!form.stock_item_id) {
    setError('Please select a stock item')
    setSaving(false)
    return
  }

  if (!form.quantity_requested || form.quantity_requested <= 0) {
    setError('Please enter a valid quantity')
    setSaving(false)
    return
  }

  const { error: insertError } = await supabase
    .from('stock_requests')
    .insert({
      staff_id: profile.id,
      branch_id: profile.branch_id,
      stock_item_id: form.stock_item_id,
      quantity_requested: parseInt(form.quantity_requested),
      urgency: form.urgency,
      notes: form.notes || null,
      status: 'pending'
    })

  if (insertError) {
    setError(insertError.message)
    setSaving(false)
    return
  }

  setSuccess('Stock request submitted successfully!')
  setShowForm(false)
  setForm({ stock_item_id: '', quantity_requested: '', urgency: 'normal', notes: '' })
  setTimeout(() => setSuccess(''), 3000)
  loadData()
  setSaving(false)
}

  function getUrgencyColor(urgency) {
    if (urgency === 'urgent') return 'bg-red-50 text-red-700'
    if (urgency === 'low') return 'bg-gray-50 text-gray-600'
    return 'bg-yellow-50 text-yellow-700'
  }

  function getStatusColor(status) {
    if (status === 'approved') return 'bg-green-50 text-green-700'
    if (status === 'rejected') return 'bg-red-50 text-red-700'
    if (status === 'ordered') return 'bg-blue-50 text-blue-700'
    return 'bg-yellow-50 text-yellow-700'
  }

  function getStatusLabel(status) {
    if (status === 'approved') return '✅ Approved'
    if (status === 'rejected') return '❌ Rejected'
    if (status === 'ordered') return '📦 Ordered'
    return '⏳ Pending'
  }

  function getStockLevel(item) {
    if (item.current_quantity <= 0) return 'out'
    if (item.current_quantity <= item.min_quantity * 0.5) return 'critical'
    if (item.current_quantity <= item.min_quantity) return 'low'
    return 'ok'
  }

  function getStockLevelColor(level) {
    if (level === 'out') return 'bg-red-100 text-red-700'
    if (level === 'critical') return 'bg-red-50 text-red-600'
    if (level === 'low') return 'bg-yellow-50 text-yellow-700'
    return 'bg-green-50 text-green-700'
  }

  function getStockLevelLabel(level) {
    if (level === 'out') return 'Out of stock'
    if (level === 'critical') return 'Critical'
    if (level === 'low') return 'Low'
    return 'OK'
  }

  // Group items by category
  function getGroupedItems() {
    const filtered = stockItems.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    const groups = {}
    filtered.forEach(function(item) {
      const cat = item.category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    })
    return groups
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  )
  {!profile?.branch_id && (
    <div className="bg-red-50 rounded-xl px-4 py-3">
        <p className="text-red-700 text-sm font-medium">⚠️ No branch assigned</p>
        <p className="text-red-500 text-xs mt-1">
        Please ask your manager to assign you to a branch before submitting stock requests.
        </p>
    </div>
  )}
  const groupedItems = getGroupedItems()
  const lowStockCount = stockItems.filter(i => getStockLevel(i) !== 'ok').length

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm px-4 py-4 flex justify-between items-center">
        <button onClick={() => router.push('/dashboard')} className="text-blue-500 text-sm font-medium">
          ← Dashboard
        </button>
        <h1 className="text-lg font-bold text-gray-800">📦 Stock</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
        >
          + Request
        </button>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {success && (
          <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm font-medium">
            ✅ {success}
          </div>
        )}

        {/* Low stock alert */}
        {lowStockCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-yellow-800 text-sm font-medium">
                {lowStockCount} item{lowStockCount > 1 ? 's' : ''} need attention
              </p>
              <p className="text-yellow-600 text-xs">
                Check stock levels and submit reorder requests
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm p-2 flex gap-2">
          <button
            onClick={() => setActiveTab('items')}
            className={'flex-1 py-3 rounded-xl text-sm font-medium transition ' +
              (activeTab === 'items' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
          >
            📋 Stock Levels
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={'flex-1 py-3 rounded-xl text-sm font-medium transition ' +
              (activeTab === 'requests' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
          >
            🔄 My Requests
            {requests.filter(r => r.status === 'pending').length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs px-1.5 rounded-full">
                {requests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
        </div>

        {/* Stock Items Tab */}
        {activeTab === 'items' && (
          <div className="space-y-3">
            {/* Search */}
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search items or categories..."
                className="w-full text-sm focus:outline-none text-gray-700"
              />
            </div>

            {Object.entries(groupedItems).map(function([category, items]) {
              return (
                <div key={category} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {category}
                    </p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map(function(item) {
                      const level = getStockLevel(item)
                      return (
                        <div key={item.id} className="px-4 py-3 flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-gray-800 text-sm">{item.name}</p>
                            <p className="text-gray-400 text-xs">
                              Current: {item.current_quantity} {item.unit} · Min: {item.min_quantity} {item.unit}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={'text-xs font-medium px-2 py-1 rounded-full ' + getStockLevelColor(level)}>
                              {getStockLevelLabel(level)}
                            </span>
                            {level !== 'ok' && (
                              <button
                                onClick={() => {
                                  setForm({ ...form, stock_item_id: item.id, urgency: level === 'critical' || level === 'out' ? 'urgent' : 'normal' })
                                  setShowForm(true)
                                }}
                                className="text-blue-500 text-xs font-medium hover:text-blue-700"
                              >
                                Request
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* My Requests Tab */}
        {activeTab === 'requests' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-700 text-sm">
                My Requests ({requests.length})
              </h3>
            </div>

            {requests.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-gray-400 text-sm">No requests yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {requests.map(function(req) {
                  return (
                    <div key={req.id} className="px-4 py-4">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-medium text-gray-800 text-sm">
                          {req.item?.name}
                        </p>
                        <span className={'text-xs font-medium px-2 py-1 rounded-full ' + getStatusColor(req.status)}>
                          {getStatusLabel(req.status)}
                        </span>
                      </div>
                      <p className="text-gray-500 text-xs">
                        Quantity: {req.quantity_requested} {req.item?.unit}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={'text-xs px-2 py-0.5 rounded-full capitalize ' + getUrgencyColor(req.urgency)}>
                          {req.urgency}
                        </span>
                        <span className="text-gray-300 text-xs">{formatDate(req.created_at)}</span>
                      </div>
                      {req.notes && (
                        <p className="text-gray-400 text-xs mt-1">Note: {req.notes}</p>
                      )}
                      {req.manager_note && (
                        <div className="mt-2 bg-blue-50 rounded-lg px-3 py-2">
                          <p className="text-blue-700 text-xs">Manager: {req.manager_note}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Request Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 px-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-800">Stock Reorder Request</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Show branch info - read only */}
              <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-lg">🏢</span>
                <div>
                    <p className="text-blue-800 text-xs font-medium">Requesting for your branch</p>
                    <p className="text-blue-600 text-sm font-semibold">
                        {profile?.branch?.name || 'Branch not assigned'}
                    </p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stock Item
                </label>
                <select
                  value={form.stock_item_id}
                  onChange={e => setForm({ ...form, stock_item_id: e.target.value })}
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select an item...</option>
                  {Object.entries(getGroupedItems()).map(function([category, items]) {
                    return (
                      <optgroup key={category} label={category}>
                        {items.map(function(item) {
                          return (
                            <option key={item.id} value={item.id}>
                              {item.name} (Current: {item.current_quantity} {item.unit})
                            </option>
                          )
                        })}
                      </optgroup>
                    )
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity to Order
                </label>
                <input
                  type="number"
                  value={form.quantity_requested}
                  onChange={e => setForm({ ...form, quantity_requested: e.target.value })}
                  required
                  min="1"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter quantity..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Urgency
                </label>
                <div className="flex gap-2">
                  {['low', 'normal', 'urgent'].map(function(u) {
                    const colors = {
                      low: form.urgency === u ? 'bg-gray-600 text-white' : 'bg-gray-50 text-gray-600 border border-gray-200',
                      normal: form.urgency === u ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-700 border border-yellow-200',
                      urgent: form.urgency === u ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 border border-red-200'
                    }
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setForm({ ...form, urgency: u })}
                        className={'flex-1 py-2 rounded-lg text-sm font-medium transition capitalize ' + colors[u]}
                      >
                        {u === 'low' ? '🟢 Low' : u === 'normal' ? '🟡 Normal' : '🔴 Urgent'}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Any additional notes..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !profile?.branch_id}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {saving ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}