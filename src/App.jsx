import { useState, useEffect, useRef } from 'react'
import {
  Plus, ChevronDown, ChevronUp, Trash2, CheckCircle2,
  Clock, PauseCircle, Eye, Timer, Archive, RotateCcw
} from 'lucide-react'
import catLogo from './assets/cat_Image.png'
import './index.css'

// ─── 定数 ───────────────────────────────────────────────
const STORAGE_KEY   = 'hachiware-tasks-v1'
const DASHBOARD_KEY = 'hachiware-dashboard-v1'

const STATUS_CONFIG = {
  doing:   { label: 'Doing',   color: 'text-[#5AAAC5] bg-[#E8F4F9] border-[#A2D4E8]', dot: 'bg-[#5AAAC5]', icon: Clock },
  review:  { label: 'Review',  color: 'text-[#9B7EC8] bg-[#F0EBF8] border-[#C9B8E8]', dot: 'bg-[#9B7EC8]', icon: Eye },
  pause:   { label: 'Pause',   color: 'text-[#C4962A] bg-[#FBF5E6] border-[#E8D5A0]', dot: 'bg-[#C4962A]', icon: PauseCircle },
  waiting: { label: 'Waiting', color: 'text-[#6A9E85] bg-[#EBF3EE] border-[#AACFBC]', dot: 'bg-[#6A9E85]', icon: Timer },
  done:    { label: 'Done',    color: 'text-[#4A9E68] bg-[#EAF6EF] border-[#8FCCA5]', dot: 'bg-[#4A9E68]', icon: CheckCircle2 },
}
const STATUS_ORDER = ['doing', 'review', 'pause', 'waiting', 'done']

const PRIORITY_CONFIG = {
  high:   { label: '高', color: 'text-[#E5807A] bg-[#FDF0EF]', emoji: '🔴' },
  medium: { label: '中', color: 'text-[#D4A84B] bg-[#FDF7EC]', emoji: '🟡' },
  low:    { label: '低', color: 'text-[#6A9E85] bg-[#EBF3EE]', emoji: '🟢' },
}

// 尻尾を廃止。耳位置のみ定義
const DASHBOARD_CATEGORIES = [
  {
    id: 'routine',  label: 'ルーチン業務', emoji: '🍜',
    borderColor: 'border-[#A2C2D0]',
    bgColor:     'from-[#A2C2D0]/10 to-[#A2C2D0]/5',
    color:       '#A2C2D0',
    earPosition: 'top-left',
  },
  {
    id: 'adhoc',    label: '臨時対応',     emoji: '📷',
    borderColor: 'border-[#F2CBC9]',
    bgColor:     'from-[#F2CBC9]/10 to-[#F2CBC9]/5',
    color:       '#F2CBC9',
    earPosition: 'top-center',
  },
  {
    id: 'schedule', label: '予定',         emoji: '🎸',
    borderColor: 'border-[#C8D8A8]',
    bgColor:     'from-[#C8D8A8]/20 to-[#C8D8A8]/5',
    color:       '#C8D8A8',
    earPosition: 'top-right',
  },
]

const TOAST_MSGS = {
  add:     'タスクを追加しました',
  done:    '完了しました ✓',
  restore: 'リストに戻しました',
}

// ─── 猫耳 × 2（丸みのある三角形 × 2、SVGで描画）──────────
// 各カードの上に配置。pt-6 の wrapper 内で top-1 に置くことで
// 耳の底辺が 2px だけカード上辺に重なり「枠から生えた耳」に見える。
// cubic bezier で頂点を丸めてやわらかな耳形状を実現する。
function CatEarsDecor({ color, position }) {
  const posClass = {
    'top-left':   'absolute top-1 left-3',
    'top-center': 'absolute top-1 left-1/2 -translate-x-1/2',
    'top-right':  'absolute top-1 right-3',
  }[position] ?? ''

  return (
    <div className={`pointer-events-none ${posClass}`} aria-hidden="true">
      <svg width="50" height="22" viewBox="0 0 50 22" fill="none">
        {/* 左耳: cubic bezier で頂点(12,2)を丸める */}
        <path d="M2 22 C2 6 6 2 12 2 C18 2 22 6 22 22 Z" fill={color} />
        {/* 右耳: 左耳を x+26 にシフト */}
        <path d="M28 22 C28 6 32 2 38 2 C44 2 48 6 48 22 Z" fill={color} />
      </svg>
    </div>
  )
}

// ─── 耳モチーフ（ヘッダー・トースト用 アウトライン版）──────
function EarDecor({ size = 14, color = '#A2C2D0', opacity = 0.45 }) {
  return (
    <svg
      width={size * 2.3}
      height={size}
      viewBox="0 0 30 16"
      fill="none"
      style={{ opacity }}
      aria-hidden="true"
    >
      <path d="M1 15 L8 1 L15 15"  stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M15 15 L22 1 L29 15" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─── 耳型チェックボックス ────────────────────────────────
function EarCheckbox({ isDone, onClick }) {
  return (
    <button
      onClick={onClick}
      className="mt-1 flex-shrink-0 transition-transform duration-150 hover:scale-110 active:scale-95"
      title={isDone ? 'リストに戻す' : '完了にする'}
    >
      <svg width="22" height="15" viewBox="0 0 30 16" fill="none">
        {isDone ? (
          <>
            <path d="M1 15 L8 1 L15 15 Z"  fill="#4A9E68" />
            <path d="M15 15 L22 1 L29 15 Z" fill="#4A9E68" />
          </>
        ) : (
          <>
            <path d="M1 15 L8 1 L15 15"  stroke="#A2C2D0" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <path d="M15 15 L22 1 L29 15" stroke="#A2C2D0" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
      </svg>
    </button>
  )
}

// ─── StatusBadge ─────────────────────────────────────────
function StatusBadge({ status, onChange }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CONFIG[status]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer select-none transition-all duration-150 ${cfg.color} hover:opacity-80`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-[9999] bg-white rounded-xl shadow-[0_4px_20px_rgba(162,194,208,0.30)] border border-[#A2C2D0]/20 p-1.5 flex flex-col gap-0.5 min-w-[110px]">
          {STATUS_ORDER.map(s => {
            const c = STATUS_CONFIG[s]
            return (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false) }}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer w-full ${c.color} hover:opacity-80 ${s === status ? 'ring-1 ring-offset-1 ring-current' : ''}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                {c.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Toast ───────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-[fade-in_0.3s_ease-out]">
      <div className="bg-white border border-[#A2C2D0]/30 shadow-[0_4px_20px_rgba(162,194,208,0.20)] rounded-2xl px-5 py-3 flex items-center gap-3 text-sm font-medium text-gray-700">
        <EarDecor size={12} opacity={0.8} />
        {msg}
      </div>
    </div>
  )
}

// ─── DashboardCard（丸み耳 × 2、尻尾なし）──────────────────
function DashboardCard({ category, items, onAdd, onDelete }) {
  const [open, setOpen] = useState(true)
  const [input, setInput] = useState('')

  const handleAdd = () => {
    const v = input.trim()
    if (!v) return
    onAdd(category.id, v)
    setInput('')
  }

  return (
    // pt-6（24px）: CatEarsDecor（高さ22px）を top-1（4px）に置くと
    // 耳底辺（4+22=26px）がカード上辺（24px）に 2px 重なり「枠と一体化」する
    <div className="relative pt-6">
      <CatEarsDecor position={category.earPosition} color={category.color} />

      <div
        className={`rounded-2xl border-2 ${category.borderColor} bg-gradient-to-br ${category.bgColor} transition-all duration-300`}
      >
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/20 transition-colors"
        >
          <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
            <span className="text-base">{category.emoji}</span>
            {category.label}
            <span className="text-xs font-normal bg-white/60 px-2 py-0.5 rounded-full text-gray-500">
              {items.length}件
            </span>
          </div>
          {open
            ? <ChevronUp size={15} className="text-gray-400" />
            : <ChevronDown size={15} className="text-gray-400" />}
        </button>

        {open && (
          <div className="px-4 pb-4 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="追加する..."
                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-white/80 bg-white/70 focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/40 placeholder-gray-400"
              />
              <button
                onClick={handleAdd}
                className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-[#7AAABB] transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
            {items.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-1">項目なし</p>
            )}
            {items.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2 text-sm text-gray-700 group"
              >
                <span className="flex-1">{item.text}</span>
                <button
                  onClick={() => onDelete(category.id, item.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TaskRow ─────────────────────────────────────────────
function TaskRow({ task, onStatusChange, onDelete, onToggleDone }) {
  const isDone = task.status === 'done'
  const priorityCfg = PRIORITY_CONFIG[task.priority || 'medium']

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl transition-all duration-200 hover:bg-[#FAF7F2]/70 group ${isDone ? 'opacity-50' : ''}`}
    >
      <EarCheckbox isDone={isDone} onClick={() => onToggleDone(task.id, isDone)} />

      <div className="flex-1 min-w-0">
        <span className={`text-sm text-gray-700 leading-relaxed ${isDone ? 'line-through text-gray-400' : ''}`}>
          {task.title}
        </span>
        {task.memo && (
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{task.memo}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <StatusBadge status={task.status} onChange={s => onStatusChange(task.id, s)} />
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityCfg.color}`}>
            {priorityCfg.emoji} {priorityCfg.label}
          </span>
          {task.dueDate && (
            <span className="text-xs text-gray-400">📅 {task.dueDate}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
        {isDone && (
          <button
            onClick={() => onToggleDone(task.id, isDone)}
            className="p-1.5 text-gray-400 hover:text-[#7AAABB] rounded-lg hover:bg-[#A2C2D0]/10 transition-colors"
            title="リストに戻す"
          >
            <RotateCcw size={13} />
          </button>
        )}
        <button
          onClick={() => onDelete(task.id)}
          className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-50 transition-colors"
          title="削除"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── TaskInputForm ────────────────────────────────────────
function TaskInputForm({ onAdd }) {
  const [title, setTitle]       = useState('')
  const [memo, setMemo]         = useState('')
  const [status, setStatus]     = useState('doing')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate]   = useState('')
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    const v = title.trim()
    if (!v) return
    onAdd({ title: v, memo: memo.trim(), status, priority, dueDate })
    setTitle(''); setMemo(''); setStatus('doing')
    setPriority('medium'); setDueDate(''); setExpanded(false)
    inputRef.current?.focus()
  }

  return (
    <div
      className="relative bg-white rounded-2xl shadow-[0_4px_20px_rgba(162,194,208,0.20)] border-2 border-[#A2C2D0]/30 p-5 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(162,194,208,0.07) 0%, rgba(242,203,201,0.07) 100%)' }}
    >
      <div className="absolute top-3 right-4 pointer-events-none">
        <EarDecor size={13} opacity={0.3} />
      </div>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-3 items-center">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder="新しいタスクを入力"
            className="flex-1 text-sm font-medium px-4 py-2.5 rounded-xl border-2 border-[#A2C2D0]/25 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/40 focus:border-[#A2C2D0]/50 placeholder-gray-400 transition-all"
          />
          <button
            type="submit"
            disabled={!title.trim()}
            className="px-4 py-2.5 rounded-xl font-medium transition-all duration-200 active:scale-95 bg-[#A2C2D0] text-white hover:bg-[#7AAABB] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm flex-shrink-0"
          >
            <Plus size={16} />追加
          </button>
        </div>

        {expanded && (
          <div className="mt-4 flex flex-col gap-3 animate-[fade-in_0.3s_ease-out]">
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="メモ（任意）"
              rows={2}
              className="w-full text-sm px-4 py-2.5 rounded-xl border-2 border-[#A2C2D0]/15 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/30 placeholder-gray-400 resize-none"
            />
            <div className="flex gap-x-4 gap-y-2 flex-wrap items-center">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="font-medium">ステータス</span>
                <StatusBadge status={status} onChange={setStatus} />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="font-medium">優先度</span>
                <div className="flex gap-1">
                  {Object.entries(PRIORITY_CONFIG).map(([k, cfg]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPriority(k)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${cfg.color} ${priority === k ? 'ring-2 ring-offset-1 ring-current' : 'opacity-50 hover:opacity-80'}`}
                    >
                      {cfg.emoji} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
                <span className="font-medium">期限</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="text-xs px-2 py-1 rounded-lg border border-[#A2C2D0]/20 bg-white/80 focus:outline-none focus:ring-1 focus:ring-[#A2C2D0]/40"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setExpanded(false)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">閉じる</button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────
function EmptyState() {
  return (
    <div className="py-14 text-center flex flex-col items-center gap-3">
      <div className="flex gap-4 text-3xl mb-1">
        <span>🍜</span><span>📷</span><span>🎸</span><span>🎀</span>
      </div>
      <p className="text-sm text-gray-400 font-medium">タスクはありません</p>
    </div>
  )
}

// ─── メインアプリ ──────────────────────────────────────────
export default function App() {
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? [] }
    catch { return [] }
  })
  const [dashboard, setDashboard] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DASHBOARD_KEY) ?? 'null') ?? { routine: [], adhoc: [], schedule: [] } }
    catch { return { routine: [], adhoc: [], schedule: [] } }
  })

  const [dashboardOpen, setDashboardOpen] = useState(true)
  const [archiveOpen, setArchiveOpen]     = useState(false)
  const [toast, setToast]                 = useState(null)
  const [filter, setFilter]               = useState('all')

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)) }, [tasks])
  useEffect(() => { localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dashboard)) }, [dashboard])

  const addTask = ({ title, memo, status, priority, dueDate }) => {
    setTasks(prev => [{
      id: Date.now().toString(), title, memo, status, priority, dueDate,
      createdAt: new Date().toISOString(), completedAt: null,
    }, ...prev])
    setToast(TOAST_MSGS.add)
  }

  const changeStatus = (id, newStatus) => {
    setTasks(prev => prev.map(t => t.id !== id ? t : {
      ...t, status: newStatus,
      completedAt: newStatus === 'done' ? new Date().toISOString() : null,
    }))
    if (newStatus === 'done') setToast(TOAST_MSGS.done)
  }

  const toggleDone = (id, currentlyDone) => {
    if (currentlyDone) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'doing', completedAt: null } : t))
      setToast(TOAST_MSGS.restore)
    } else {
      changeStatus(id, 'done')
    }
  }

  const deleteTask = (id) => setTasks(prev => prev.filter(t => t.id !== id))

  const addDashboardItem = (catId, text) =>
    setDashboard(prev => ({ ...prev, [catId]: [...(prev[catId] || []), { id: Date.now().toString(), text }] }))
  const deleteDashboardItem = (catId, itemId) =>
    setDashboard(prev => ({ ...prev, [catId]: (prev[catId] || []).filter(i => i.id !== itemId) }))

  const activeTasks   = tasks.filter(t => t.status !== 'done')
  const doneTasks     = tasks.filter(t => t.status === 'done').sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
  const filteredActive = filter === 'all' ? activeTasks : activeTasks.filter(t => t.status === filter)
  const todayDone     = doneTasks.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString()).length

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-20" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>

      {/* ヘッダー */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#A2C2D0]/25 shadow-[0_2px_12px_rgba(162,194,208,0.18)]">
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="absolute -top-1 -left-1 pointer-events-none">
                <EarDecor size={10} opacity={0.5} />
              </div>
              <img src={catLogo} alt="Koto Note" className="w-10 h-10 rounded-2xl object-cover shadow-[0_2px_8px_rgba(162,194,208,0.30)]" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800 text-base leading-tight tracking-wide">Koto Note</h1>
              <p className="text-xs text-gray-400 tracking-wider">TASK MANAGER</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-[#A2C2D0]/15 px-3 py-1.5 rounded-full text-[#7AAABB] font-medium">
              <Clock size={11} />進行中 {activeTasks.filter(t => t.status === 'doing').length}
            </div>
            <div className="flex items-center gap-1.5 bg-[#EAF6EF] px-3 py-1.5 rounded-full text-[#4A9E68] font-medium">
              <CheckCircle2 size={11} />今日 {todayDone}件完了
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-7 flex flex-col gap-7">

        {/* ダッシュボード */}
        <section>
          <button
            onClick={() => setDashboardOpen(v => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-700 mb-5 transition-colors tracking-widest uppercase"
          >
            <EarDecor size={10} opacity={0.6} />
            ダッシュボード
            <span className="text-gray-300">{dashboardOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
          </button>
          {dashboardOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-[fade-in_0.3s_ease-out]">
              {DASHBOARD_CATEGORIES.map(cat => (
                <DashboardCard
                  key={cat.id} category={cat}
                  items={dashboard[cat.id] || []}
                  onAdd={addDashboardItem} onDelete={deleteDashboardItem}
                />
              ))}
            </div>
          )}
        </section>

        {/* タスク入力 */}
        <section>
          <TaskInputForm onAdd={addTask} />
        </section>

        {/* アクティブタスク */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 tracking-widest uppercase">タスク</span>
              <span className="text-xs text-gray-400 bg-[#F0EBE3] px-2 py-0.5 rounded-full">{filteredActive.length}</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${filter === 'all' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-100'}`}
              >すべて</button>
              {STATUS_ORDER.filter(s => s !== 'done').map(s => {
                const cfg = STATUS_CONFIG[s]
                const count = activeTasks.filter(t => t.status === s).length
                return (
                  <button key={s} onClick={() => setFilter(s)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${filter === s ? `${cfg.color} border` : 'text-gray-400 hover:bg-gray-50'}`}
                  >{cfg.label}{count > 0 && ` ${count}`}</button>
                )
              })}
            </div>
          </div>

          {/* overflow-hidden を外して StatusBadge ドロップダウンがクリップされないようにする */}
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(162,194,208,0.18)] border border-[#A2C2D0]/20">
            {filteredActive.length === 0 ? <EmptyState /> : (
              <div className="flex flex-col divide-y divide-[#F5F0EB]">
                {filteredActive.map(task => (
                  <TaskRow key={task.id} task={task}
                    onStatusChange={changeStatus} onDelete={deleteTask} onToggleDone={toggleDone}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 完了済みアーカイブ */}
        {doneTasks.length > 0 && (
          <section>
            <button
              onClick={() => setArchiveOpen(v => !v)}
              className="flex items-center gap-2 w-full text-xs font-semibold text-gray-400 hover:text-gray-600 mb-4 transition-colors tracking-widest uppercase"
            >
              <Archive size={13} className="text-[#8FC8A4]" />
              完了済み
              <span className="bg-[#F0EBE3] px-2 py-0.5 rounded-full normal-case tracking-normal font-normal text-gray-400">{doneTasks.length}件</span>
              <span className="ml-auto text-gray-300">{archiveOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
            </button>
            {archiveOpen && (
              <div className="bg-white/60 rounded-2xl border border-[#A2C2D0]/15 animate-[fade-in_0.3s_ease-out]">
                <div className="px-4 py-3 border-b border-[#F0EBE3]">
                  <p className="text-xs text-gray-400 text-center">完了済みのタスク</p>
                </div>
                <div className="flex flex-col divide-y divide-[#F5F0EB]">
                  {doneTasks.map(task => (
                    <TaskRow key={task.id} task={task}
                      onStatusChange={changeStatus} onDelete={deleteTask} onToggleDone={toggleDone}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
