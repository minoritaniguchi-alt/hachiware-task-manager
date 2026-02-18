import { useState, useEffect, useRef } from 'react'
import {
  Plus, ChevronDown, ChevronUp, Trash2, CheckCircle2,
  Clock, PauseCircle, Eye, Timer, Archive, Sparkles,
  RotateCcw, GripVertical, Coffee
} from 'lucide-react'
import './index.css'

// ─── 定数 ───────────────────────────────────────────────
const STORAGE_KEY = 'hachiware-tasks-v1'
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

const DASHBOARD_CATEGORIES = [
  { id: 'routine',  label: 'ルーチン業務', emoji: '🔄', borderColor: 'border-[#A2C2D0]', bgColor: 'from-[#A2C2D0]/10 to-[#A2C2D0]/5' },
  { id: 'adhoc',   label: '臨時対応',     emoji: '⚡', borderColor: 'border-[#F2CBC9]', bgColor: 'from-[#F2CBC9]/10 to-[#F2CBC9]/5' },
  { id: 'schedule', label: '予定',         emoji: '📅', borderColor: 'border-[#C8D8A8]', bgColor: 'from-[#C8D8A8]/20 to-[#C8D8A8]/5' },
]

const HACHIWARE_MSGS = {
  done: ['えらい！💙', 'すごい！🎉', 'やったね✨', '完璧！🐱', 'えっらーい！💙'],
  add:  ['がんばろ🐱', 'いってみよう✨', 'ファイト💪'],
}

function randomMsg(type) {
  const arr = HACHIWARE_MSGS[type]
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─── StatusBadge ─────────────────────────────────────────
function StatusBadge({ status, onChange, readonly = false }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CONFIG[status]

  if (readonly) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.color}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    )
  }

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
        <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-[0_4px_20px_rgba(162,194,208,0.20)] border border-[#A2C2D0]/20 p-1.5 flex flex-col gap-0.5 min-w-[110px]">
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

// ─── Toast通知 ──────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-[fade-in_0.3s_ease-out]">
      <div className="bg-white border border-[#A2C2D0]/30 shadow-[0_4px_20px_rgba(162,194,208,0.20)] rounded-2xl px-5 py-3 flex items-center gap-2.5 text-sm font-medium text-gray-700">
        <span className="text-xl">🐱</span>
        {msg}
      </div>
    </div>
  )
}

// ─── DashboardCard ───────────────────────────────────────
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
    <div className={`rounded-2xl border-2 ${category.borderColor} bg-gradient-to-br ${category.bgColor} overflow-hidden transition-all duration-300`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/20 transition-colors"
      >
        <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
          <span className="text-lg">{category.emoji}</span>
          {category.label}
          <span className="text-xs font-normal bg-white/60 px-2 py-0.5 rounded-full text-gray-500">
            {items.length}件
          </span>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
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
            <button onClick={handleAdd} className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-[#7AAABB] transition-colors">
              <Plus size={16} />
            </button>
          </div>
          {items.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-1">まだ何もないよ🐱</p>
          )}
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2 text-sm text-gray-700 group">
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
  )
}

// ─── TaskRow ─────────────────────────────────────────────
function TaskRow({ task, onStatusChange, onDelete, onArchiveRestore }) {
  const isDone = task.status === 'done'
  const priorityCfg = PRIORITY_CONFIG[task.priority || 'medium']

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-[#FAF7F2]/60 group ${isDone ? 'opacity-50' : ''}`}>
      <div className="mt-0.5 text-gray-200 group-hover:text-gray-300 cursor-grab">
        <GripVertical size={14} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className={`text-sm text-gray-700 leading-relaxed ${isDone ? 'line-through text-gray-400' : ''}`}>
            {task.title}
          </span>
        </div>
        {task.memo && (
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{task.memo}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
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
            onClick={() => onArchiveRestore(task.id)}
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
    setTitle('')
    setMemo('')
    setStatus('doing')
    setPriority('medium')
    setDueDate('')
    setExpanded(false)
    inputRef.current?.focus()
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(162,194,208,0.20)] border-2 border-[#A2C2D0]/30 p-4" style={{background: 'linear-gradient(135deg, rgba(162,194,208,0.08) 0%, rgba(242,203,201,0.08) 100%)'}}>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-3 items-center">
          <div className="text-2xl select-none">🐱</div>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder="新しいタスクを追加しよう！"
            className="flex-1 text-sm font-medium px-4 py-2.5 rounded-xl border-2 border-[#A2C2D0]/25 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/40 focus:border-[#A2C2D0]/50 placeholder-gray-400 transition-all"
          />
          <button
            type="submit"
            disabled={!title.trim()}
            className="px-4 py-2 rounded-xl font-medium transition-all duration-200 active:scale-95 bg-[#A2C2D0] text-white hover:bg-[#7AAABB] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm"
          >
            <Plus size={16} />
            追加
          </button>
        </div>

        {expanded && (
          <div className="mt-3 flex flex-col gap-2.5 animate-[fade-in_0.3s_ease-out]">
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="メモ（任意）"
              rows={2}
              className="w-full text-sm px-4 py-2 rounded-xl border-2 border-[#A2C2D0]/15 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/30 placeholder-gray-400 resize-none"
            />
            <div className="flex gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>ステータス:</span>
                <StatusBadge status={status} onChange={setStatus} />
              </div>

              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>優先度:</span>
                <div className="flex gap-1">
                  {Object.entries(PRIORITY_CONFIG).map(([k, cfg]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPriority(k)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${cfg.color} ${priority === k ? 'ring-2 ring-offset-1 ring-current' : 'opacity-60 hover:opacity-100'}`}
                    >
                      {cfg.emoji} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
                <span>期限:</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="text-xs px-2 py-1 rounded-lg border border-[#A2C2D0]/20 bg-white/80 focus:outline-none focus:ring-1 focus:ring-[#A2C2D0]/40"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => setExpanded(false)} className="text-xs text-gray-400 hover:text-gray-600">閉じる</button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}

// ─── メインアプリ ──────────────────────────────────────────
export default function App() {
  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const [dashboard, setDashboard] = useState(() => {
    try {
      const saved = localStorage.getItem(DASHBOARD_KEY)
      return saved ? JSON.parse(saved) : { routine: [], adhoc: [], schedule: [] }
    } catch { return { routine: [], adhoc: [], schedule: [] } }
  })

  const [dashboardOpen, setDashboardOpen] = useState(true)
  const [archiveOpen, setArchiveOpen]     = useState(false)
  const [toast, setToast]                 = useState(null)
  const [filter, setFilter]               = useState('all')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dashboard))
  }, [dashboard])

  const addTask = ({ title, memo, status, priority, dueDate }) => {
    const newTask = {
      id: Date.now().toString(),
      title, memo, status, priority, dueDate,
      createdAt: new Date().toISOString(),
      completedAt: null,
    }
    setTasks(prev => [newTask, ...prev])
    showToast(randomMsg('add'))
  }

  const changeStatus = (id, newStatus) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t
      return {
        ...t,
        status: newStatus,
        completedAt: newStatus === 'done' ? new Date().toISOString() : null,
      }
    }))
    if (newStatus === 'done') showToast(randomMsg('done'))
  }

  const deleteTask = (id) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const restoreTask = (id) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, status: 'doing', completedAt: null } : t
    ))
    showToast('リストに戻したよ🐱')
  }

  const showToast = (msg) => setToast(msg)

  const addDashboardItem = (categoryId, text) => {
    setDashboard(prev => ({
      ...prev,
      [categoryId]: [...(prev[categoryId] || []), { id: Date.now().toString(), text }]
    }))
  }

  const deleteDashboardItem = (categoryId, itemId) => {
    setDashboard(prev => ({
      ...prev,
      [categoryId]: (prev[categoryId] || []).filter(i => i.id !== itemId)
    }))
  }

  const activeTasks = tasks.filter(t => t.status !== 'done')
  const doneTasks   = tasks
    .filter(t => t.status === 'done')
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))

  const filteredActive = filter === 'all'
    ? activeTasks
    : activeTasks.filter(t => t.status === filter)

  const todayDone = doneTasks.filter(t => {
    if (!t.completedAt) return false
    const d = new Date(t.completedAt)
    return d.toDateString() === new Date().toDateString()
  }).length

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-16" style={{fontFamily: "'Noto Sans JP', sans-serif"}}>

      {/* ヘッダー */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b-2 border-[#A2C2D0]/20 shadow-[0_2px_12px_rgba(162,194,208,0.25)]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#A2C2D0] to-[#F2CBC9] flex items-center justify-center text-xl shadow-[0_2px_12px_rgba(162,194,208,0.25)]">
              🐱
            </div>
            <div>
              <h1 className="font-bold text-gray-800 text-lg leading-tight">ハチワレのタスク帳</h1>
              <p className="text-xs text-gray-400">いっしょにがんばろ💙</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-[#A2C2D0]/15 px-3 py-1.5 rounded-full text-[#7AAABB] font-medium">
              <Clock size={12} />
              進行中 {activeTasks.filter(t => t.status === 'doing').length}
            </div>
            <div className="flex items-center gap-1.5 bg-[#EAF6EF] px-3 py-1.5 rounded-full text-[#4A9E68] font-medium">
              <CheckCircle2 size={12} />
              今日 {todayDone}件完了
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 flex flex-col gap-5">

        {/* ダッシュボード */}
        <section>
          <button
            onClick={() => setDashboardOpen(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-800 mb-3 transition-colors group"
          >
            <Coffee size={15} className="text-[#A2C2D0]" />
            ダッシュボード
            <span className="text-xs font-normal text-gray-400 bg-[#F0EBE3] px-2 py-0.5 rounded-full">定型・予定</span>
            <span className="ml-1 text-gray-300 group-hover:text-gray-400">
              {dashboardOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {dashboardOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-[fade-in_0.3s_ease-out]">
              {DASHBOARD_CATEGORIES.map(cat => (
                <DashboardCard
                  key={cat.id}
                  category={cat}
                  items={dashboard[cat.id] || []}
                  onAdd={addDashboardItem}
                  onDelete={deleteDashboardItem}
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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-[#E5A8A5]" />
              <span className="text-sm font-semibold text-gray-700">やること</span>
              <span className="text-xs text-gray-400 bg-[#F0EBE3] px-2 py-0.5 rounded-full">{filteredActive.length}件</span>
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${filter === 'all' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                すべて
              </button>
              {STATUS_ORDER.filter(s => s !== 'done').map(s => {
                const cfg = STATUS_CONFIG[s]
                const count = activeTasks.filter(t => t.status === s).length
                return (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${filter === s ? `${cfg.color} border` : 'text-gray-400 hover:bg-gray-50'}`}
                  >
                    {cfg.label}{count > 0 && ` ${count}`}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(162,194,208,0.20)] border border-[#A2C2D0]/20 p-2 flex flex-col divide-y divide-gray-50">
            {filteredActive.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-4xl mb-3">🐱</div>
                <p className="text-sm text-gray-400">タスクがないよ！のんびりしよ💙</p>
              </div>
            ) : (
              filteredActive.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onStatusChange={changeStatus}
                  onDelete={deleteTask}
                  onArchiveRestore={restoreTask}
                />
              ))
            )}
          </div>
        </section>

        {/* Doneアーカイブ */}
        {doneTasks.length > 0 && (
          <section>
            <button
              onClick={() => setArchiveOpen(v => !v)}
              className="flex items-center gap-2 w-full text-sm font-semibold text-gray-500 hover:text-gray-700 mb-3 transition-colors group"
            >
              <Archive size={15} className="text-[#8FC8A4]" />
              思い出アーカイブ ✅
              <span className="text-xs font-normal text-gray-400 bg-[#F0EBE3] px-2 py-0.5 rounded-full">{doneTasks.length}件完了</span>
              <span className="ml-auto text-gray-300 group-hover:text-gray-400">
                {archiveOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>

            {archiveOpen && (
              <div className="bg-[#FAF7F2]/40 rounded-2xl shadow-[0_4px_20px_rgba(162,194,208,0.20)] border border-[#A2C2D0]/20 p-2 animate-[fade-in_0.3s_ease-out] flex flex-col divide-y divide-gray-50">
                <div className="pb-2.5 mb-1 text-center">
                  <p className="text-xs text-gray-400">完了したタスクたち💙 エライッ！</p>
                </div>
                {doneTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onStatusChange={changeStatus}
                    onDelete={deleteTask}
                    onArchiveRestore={restoreTask}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* トースト */}
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
