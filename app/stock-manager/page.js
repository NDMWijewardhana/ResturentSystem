// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function StockManagerPage() {
  const [requests, setRequests] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('requests')
  const [filter, setFilter] = useState('pending')
  const [actioningId, setActioningId] = useState(null)
  const [managerNote, setManagerNote] = useState('')
  const [showNoteFor, setShowNoteFor] = useState(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemSaving, setItemSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [itemForm, setItemForm] = useState({
    name: '', category: '', unit: 'units',
    min_quantity: '', current_quantity: ''})
  const router = useRouter()
  const supabase = createClient()
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('all')

  useEffect(() => {
    loadData()
  }, [filter, selectedBranch])

async function loadData() {
  setLoading(true)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { router.push('/'); return }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'branch_manager') {
    router.push('/dashboard')
    return
  }

  // Load branches
  const { data: branchData } = await supabase
    .from('branches')
    .select('*')
    .order('name')

  setBranches(branchData || [])

  // Load stock requests with branch filter
  let query = supabase
    .from('stock_requests')
    .select(`
      *,
      staff:profiles!stock_requests_staff_id_fkey(full_name),
      branch:branches!stock_requests_branch_id_fkey(name),
      item:stock_items(name, unit, category)
    `)
    .order('created_at', { ascending: false })

  if (filter !== 'all') {
    query = query.eq('status', filter)
  }

  if (selectedBranch !== 'all') {
    query = query.eq('branch_id', selectedBranch)
  }

  const { data: requestsData } = await query
  setRequests(requestsData || [])

  // Load stock items with branch filter
  const itemsQuery = supabase
  .from('stock_items')
  .select('*')
  .order('category')
  .order('name')

  const { data: itemsData } = await itemsQuery
  setStockItems(itemsData || [])
  setLoading(false)
}

  async function handleAction(requestId, action, request) {
    setActioningId(requestId)

    const { error } = await supabase
      .from('stock_requests')
      .update({
        status: action,
        manager_note: managerNote || null,
        actioned_at: new Date().toISOString()
      })
      .eq('id', requestId)

    if (error) {
      alert('Error: ' + error.message)
      setActioningId(null)
      return
    }

    // If approved and ordered, update stock quantity
    if (action === 'ordered') {
      await supabase
        .from('stock_items')
        .update({
          current_quantity: supabase.rpc('increment', {
            row_id: request.stock_item_id,
            amount: request.quantity_requested
          })
        })
        .eq('id', request.stock_item_id)
    }

    setManagerNote('')
    setShowNoteFor(null)
    setActioningId(null)
    setSuccess('Request ' + action + ' successfully!')
    setTimeout(() => setSuccess(''), 3000)
    loadData()
  }

  async function handleUpdateStock(itemId, newQuantity) {
    await supabase
      .from('stock_items')
      .update({ current_quantity: parseInt(newQuantity) })
      .eq('id', itemId)
    loadData()
  }

  function openAddItemForm() {
    setEditingItem(null)
    setItemForm({ name: '', category: '', unit: 'units', min_quantity: '', current_quantity: '' })
    setShowItemForm(true)
  }

  function openEditItemForm(item) {
    setEditingItem(item)
    setItemForm({
      name: item.name,
      category: item.category || '',
      unit: item.unit || 'units',
      min_quantity: item.min_quantity,
      current_quantity: item.current_quantity
    })
    setShowItemForm(true)
  }

  async function handleSaveItem(e) {
    e.preventDefault()
    setItemSaving(true)

    const payload = {
      name: itemForm.name,
      category: itemForm.category,
      unit: itemForm.unit,
      min_quantity: parseInt(itemForm.min_quantity),
      current_quantity: parseInt(itemForm.current_quantity)
    }

    if (editingItem) {
      await supabase.from('stock_items').update(payload).eq('id', editingItem.id)
    } else {
      await supabase.from('stock_items').insert(payload)
    }    
    setShowItemForm(false)
    setItemSaving(false)
    loadData()
  }

  async function handleDeleteItem(id) {
    if (!confirm('Delete this stock item?')) return
    await supabase.from('stock_items').delete().eq('id', id)
    loadData()
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

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short'
    })
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const lowStockCount = stockItems.filter(i => getStockLevel(i) !== 'ok').length

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm px-4 py-4 flex justify-between items-center">
        <button onClick={() => router.push('/dashboard')} className="text-blue-500 text-sm font-medium">
          ← Dashboard
        </button>
        <h1 className="text-lg font-bold text-gray-800">📦 Stock Management</h1>
        <div className="w-16" />
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {success && (
          <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm font-medium">
            ✅ {success}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-gray-500 text-xs mb-1">Pending Requests</p>
            <p className="text-2xl font-bold text-gray-800">{pendingCount}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-gray-500 text-xs mb-1">Low Stock Items</p>
            <p className={'text-2xl font-bold ' + (lowStockCount > 0 ? 'text-red-600' : 'text-gray-800')}>
              {lowStockCount}
            </p>
          </div>
        </div>
        {/* Branch filter */}
        {branches.length > 1 && (
        <div className="bg-white rounded-2xl shadow-sm p-4">
            <label className="block text-xs font-medium text-gray-500 mb-2">
            Filter by Branch
            </label>
            <div className="flex gap-2 flex-wrap">
            <button
                onClick={() => setSelectedBranch('all')}
                className={
                'px-4 py-2 rounded-lg text-xs font-medium border transition ' +
                (selectedBranch === 'all'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400')
                }
            >
                All Branches
            </button>
            {branches.map(function(b) {
                return (
                <button
                    key={b.id}
                    onClick={() => setSelectedBranch(b.id)}
                    className={
                    'px-4 py-2 rounded-lg text-xs font-medium border transition ' +
                    (selectedBranch === b.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400')
                    }
                >
                    {b.name}
                </button>
                )
            })}
            </div>
        </div>
        )}
        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm p-2 flex gap-2">
          <button
            onClick={() => setActiveTab('requests')}
            className={'flex-1 py-3 rounded-xl text-sm font-medium transition ' +
              (activeTab === 'requests' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
          >
            🔄 Requests
            {pendingCount > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs px-1.5 rounded-full">{pendingCount}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={'flex-1 py-3 rounded-xl text-sm font-medium transition ' +
              (activeTab === 'inventory' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
          >
            📋 Inventory
            {lowStockCount > 0 && (
              <span className="ml-1 bg-yellow-500 text-white text-xs px-1.5 rounded-full">{lowStockCount}</span>
            )}
          </button>
        </div>

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-3">
            {/* Filter */}
            <div className="bg-white rounded-2xl shadow-sm p-2 flex gap-1">
              {['pending', 'approved', 'ordered', 'rejected', 'all'].map(function(f) {
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={'flex-1 py-2 rounded-xl text-xs font-medium transition capitalize ' +
                      (filter === f ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
                  >
                    {f}
                  </button>
                )
              })}
            </div>

            {requests.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                <p className="text-gray-400 text-sm">No {filter} requests</p>
              </div>
            ) : (
              requests.map(function(req) {
                return (
                  <div key={req.id} className="bg-white rounded-2xl shadow-sm p-5">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{req.item?.name}</p>
                        <p className="text-gray-500 text-xs">{req.item?.category}</p>
                      </div>
                      <span className={'text-xs font-medium px-2 py-1 rounded-full ' + getStatusColor(req.status)}>
                        {req.status}
                      </span>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-1">
                      <p className="text-gray-600 text-sm">
                        Requested by: <strong>{req.staff?.full_name}</strong>
                      </p>
                      <p className="text-gray-600 text-sm">
                            Branch: <strong>{req.branch?.name || 'Unknown'}</strong>
                      </p>
                      <p className="text-gray-600 text-sm">
                        Quantity: <strong>{req.quantity_requested} {req.item?.unit}</strong>
                      </p>
                      <div className="flex items-center gap-2">
                        <span className={'text-xs px-2 py-0.5 rounded-full capitalize ' + getUrgencyColor(req.urgency)}>
                          {req.urgency === 'urgent' ? '🔴' : req.urgency === 'low' ? '🟢' : '🟡'} {req.urgency}
                        </span>
                        <span className="text-gray-300 text-xs">{formatDate(req.created_at)}</span>
                      </div>
                      {req.notes && (
                        <p className="text-gray-500 text-xs">Note: {req.notes}</p>
                      )}
                    </div>

                    {req.manager_note && (
                      <div className="bg-blue-50 rounded-xl p-3 mb-3">
                        <p className="text-blue-700 text-xs">Manager note: {req.manager_note}</p>
                      </div>
                    )}

                    {req.status === 'pending' && (
                      <div className="space-y-2">
                        {showNoteFor === req.id && (
                          <input
                            type="text"
                            value={managerNote}
                            onChange={e => setManagerNote(e.target.value)}
                            placeholder="Add a note (optional)"
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowNoteFor(showNoteFor === req.id ? null : req.id)}
                            className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition"
                          >
                            {showNoteFor === req.id ? 'Hide' : '+ Note'}
                          </button>
                          <button
                            onClick={() => handleAction(req.id, 'rejected', req)}
                            disabled={actioningId === req.id}
                            className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition disabled:opacity-50"
                          >
                            ❌ Reject
                          </button>
                          <button
                            onClick={() => handleAction(req.id, 'approved', req)}
                            disabled={actioningId === req.id}
                            className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
                          >
                            ✅ Approve
                          </button>
                        </div>
                      </div>
                    )}

                    {req.status === 'approved' && (
                      <button
                        onClick={() => handleAction(req.id, 'ordered', req)}
                        disabled={actioningId === req.id}
                        className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        📦 Mark as Ordered
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                onClick={openAddItemForm}
                className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
              >
                + Add Item
              </button>
            </div>

            {stockItems.map(function(item) {
              const level = getStockLevel(item)
              return (
                <div key={item.id} className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{item.name}</p>
                      <p className="text-gray-400 text-xs"> {item.category}</p>
                    </div>
                    <span className={'text-xs font-medium px-2 py-1 rounded-full ' + getStockLevelColor(level)}>
                      {level === 'out' ? 'Out of stock' : level === 'critical' ? 'Critical' : level === 'low' ? 'Low' : 'OK'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className={'h-2 rounded-full ' + (level === 'ok' ? 'bg-green-500' : level === 'low' ? 'bg-yellow-500' : 'bg-red-500')}
                        style={{ width: Math.min(100, (item.current_quantity / Math.max(item.min_quantity, 1)) * 100) + '%' }}
                      />
                    </div>
                    <span className="text-gray-600 text-xs font-medium whitespace-nowrap">
                      {item.current_quantity} / {item.min_quantity} {item.unit}
                    </span>
                  </div>

                  {/* Quick quantity update */}
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      defaultValue={item.current_quantity}
                      min="0"
                      onBlur={e => {
                        if (parseInt(e.target.value) !== item.current_quantity) {
                          handleUpdateStock(item.id, e.target.value)
                        }
                      }}
                      className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-400 text-xs">{item.unit} current stock</span>
                    <div className="ml-auto flex gap-2">
                      <button
                        onClick={() => openEditItemForm(item)}
                        className="text-blue-500 text-xs font-medium hover:text-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-red-400 text-xs font-medium hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Item Modal */}
      {showItemForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 px-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-800">
                {editingItem ? 'Edit Stock Item' : 'Add Stock Item'}
              </h2>
              <button onClick={() => setShowItemForm(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <form onSubmit={handleSaveItem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                <input
                  type="text" value={itemForm.name}
                  onChange={e => setItemForm({ ...itemForm, name: e.target.value })} required
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text" value={itemForm.category}
                  onChange={e => setItemForm({ ...itemForm, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Meat, Vegetables, Supplies"
                />
              </div>              
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <select
                    value={itemForm.unit}
                    onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="units">units</option>
                    <option value="kg">kg</option>
                    <option value="litre">litre</option>
                    <option value="box">box</option>
                    <option value="pack">pack</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Qty</label>
                  <input
                    type="number" value={itemForm.min_quantity}
                    onChange={e => setItemForm({ ...itemForm, min_quantity: e.target.value })}
                    min="0" required
                    className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current</label>
                  <input
                    type="number" value={itemForm.current_quantity}
                    onChange={e => setItemForm({ ...itemForm, current_quantity: e.target.value })}
                    min="0" required
                    className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button" onClick={() => setShowItemForm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={itemSaving}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {itemSaving ? 'Saving...' : editingItem ? 'Update' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}