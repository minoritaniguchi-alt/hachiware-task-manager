import { useState, useEffect, useRef } from 'react'
import {
  Plus, ChevronDown, ChevronUp, Trash2, CheckCircle2,
  Clock, PauseCircle, Eye, Timer, Archive, RotateCcw,
  Pencil, X, Link as LinkIcon, Cloud, CloudOff
} from 'lucide-react'
import catLogo from './assets/cat_Image.png'
import './index.css'

// ─── 定数 ───────────────────────────────────────────────
const STORAGE_KEY   = 'hachiware-tasks-v1'
const DASHBOARD_KEY = 'hachiware-dashboard-v1'
const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbzdBCwRfaW31oVqhOuvOP9VGQSQL7JI_FL7GQ7A81JAELSPdxNI_5W5_q5UpbIcBF2xXA/exec'

const STATUS_CONFIG = {
  doing:   { label: '💨 やってる！',   color: 'text-white bg-[#2863AB] border-[#1F4F8A]', dot: 'bg-white' },
  review:  { label: '💭 どうかな⋯？', color: 'text-white bg-[#7D66AD] border-[#6350A0]', dot: 'bg-white' },
  pause:   { label: '☕️ ふぅ⋯',       color: 'text-white bg-[#A67C52] border-[#8A6340]', dot: 'bg-white' },
  waiting: { label: '🐾 まってる⋯',   color: 'text-white bg-[#4E8A7D] border-[#3A6E62]', dot: 'bg-white' },
  done:    { label: '✨ できたッ！',   color: 'text-white bg-[#E66B8C] border-[#D04A70]', dot: 'bg-white' },
}
const STATUS_ORDER = ['doing', 'review', 'pause', 'waiting', 'done']

const DASHBOARD_CATEGORIES = [
  { id: 'routine',  label: 'ルーチン業務', emoji: '🍜', borderColor: 'border-[#A2C2D0]', bgColor: 'from-[#A2C2D0]/10 to-[#A2C2D0]/5', color: '#A2C2D0', earPosition: 'top-left' },
  { id: 'adhoc',   label: '臨時対応',     emoji: '📷', borderColor: 'border-[#F2CBC9]', bgColor: 'from-[#F2CBC9]/10 to-[#F2CBC9]/5', color: '#F2CBC9', earPosition: 'top-center' },
  { id: 'schedule', label: '予定',         emoji: '🎸', borderColor: 'border-[#C8D8A8]', bgColor: 'from-[#C8D8A8]/20 to-[#C8D8A8]/5', color: '#C8D8A8', earPosition: 'top-right' },
]

const TOAST_MSGS = { add: 'タスクを追加しました', done: '完了しました ✓', restore: 'リストに戻しました', edit: '保存しました' }

/**
 * タスクデータ構造（v2）
 * {
 *   id, title,
 *   details: string,    // タスク詳細（複数行）
 *   memo: string,       // 進捗メモ（スプレッドシートの「備考」列相当）
 *   links: [{id, url, title}],  // 関連資料リンク（複数）
 *   status, dueDate,
 *   createdAt, completedAt
 * }
 */

// ─── 猫耳 × 2 ────────────────────────────────────────────
// 低めの高さ + 幅広のQベジエで「ふっくら丸みのある猫耳」を表現
function CatEarsDecor({ color, position }) {
  const posClass = {
    'top-left':   'absolute top-1 left-3',
    'top-center': 'absolute top-1 left-1/2 -translate-x-1/2',
    'top-right':  'absolute top-1 right-3',
  }[position] ?? ''
  return (
    // style={{ color }} → fill="currentColor" が参照 → CSS変数と完全同期
    <div className={`pointer-events-none ${posClass}`} aria-hidden="true" style={{ color }}>
      <svg width="116" height="41" viewBox="0 0 54 18">
        <path d="M0 18 L4 8 Q12 -4 20 8 L24 18 Z" fill="currentColor" />
        <path d="M30 18 L34 8 Q42 -4 50 8 L54 18 Z" fill="currentColor" />
      </svg>
    </div>
  )
}


function DoneToggle({ isDone, onClick }) {
  return (
    <button onClick={onClick} className="mt-0.5 flex-shrink-0 transition-all duration-150 hover:scale-110 active:scale-95" title={isDone ? 'リストに戻す' : '完了にする'}>
      {isDone
        ? <CheckCircle2 size={18} className="text-[#4A9E68]" />
        : <div className="w-[18px] h-[18px] rounded-full border-2 border-[#A2C2D0] hover:border-[#4A9E68] transition-colors" />
      }
    </button>
  )
}

// ─── StatusBadge ─────────────────────────────────────────
// ドロップダウンは z-[9999] + fixed で親の overflow に依存しない
function StatusBadge({ status, onChange }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const cfg = STATUS_CONFIG[status]

  // ドロップダウンの表示位置をボタン基準で計算
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const openDropdown = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen(true)
  }

  // 外クリックで閉じる
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={openDropdown}
        className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer select-none transition-all duration-150 ${cfg.color} hover:opacity-80`}
      >
        {cfg.label}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div
          className="fixed z-[9999] bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#A2C2D0]/20 p-1.5 flex flex-col gap-0.5 min-w-[110px]"
          style={{ top: dropPos.top, left: dropPos.left }}
          onMouseDown={e => e.stopPropagation()}
        >
          {STATUS_ORDER.map(s => {
            const c = STATUS_CONFIG[s]
            return (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false) }}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer w-full ${c.color} hover:opacity-80 ${s === status ? 'ring-1 ring-offset-1 ring-current' : ''}`}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// ─── Toast ───────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-[fade-in_0.3s_ease-out]">
      <div className="bg-white border border-[#A2C2D0]/30 shadow-[0_4px_20px_rgba(162,194,208,0.20)] rounded-2xl px-5 py-3 flex items-center gap-3 text-sm font-medium text-gray-700">
        {msg}
      </div>
    </div>
  )
}

// ─── DashboardCard ───────────────────────────────────────
function DashboardCard({ category, items, onAdd, onDelete, onEdit }) {
  const [open, setOpen] = useState(true)
  const [input, setInput] = useState('')
  const [details, setDetails] = useState('')
  const [links, setLinks] = useState([])
  const [formExpanded, setFormExpanded] = useState(false)

  const handleAdd = () => {
    const v = input.trim()
    if (!v) return
    onAdd(category.id, v, details.trim(), links)
    setInput(''); setDetails(''); setLinks([]); setFormExpanded(false)
  }

  return (
    <div className="relative pt-9">
      <CatEarsDecor position={category.earPosition} color={category.color} />

      <div className={`rounded-3xl border-2 ${category.borderColor} overflow-hidden`}>
        {/* 単色ヘッダー */}
        <button onClick={() => setOpen(v => !v)} className="w-full">
          <div className="flex items-end justify-between px-4 pb-2 pt-2" style={{ backgroundColor: category.color, minHeight: 64 }}>
            <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
              <span className="text-base">{category.emoji}</span>
              {category.label}
              <span className="text-xs font-normal bg-white/70 px-2 py-0.5 rounded-full text-gray-500">
                {items.length}件
              </span>
            </div>
            {open
              ? <ChevronUp   size={15} className="text-gray-500 flex-shrink-0" />
              : <ChevronDown size={15} className="text-gray-500 flex-shrink-0" />
            }
          </div>
        </button>

        {open && (
          <div className="bg-white px-4 pt-3 pb-4 flex flex-col gap-2">

            {/* 業務名 */}
            <div className="flex gap-2">
              <input
                type="text" value={input}
                onChange={e => setInput(e.target.value)}
                onFocus={() => setFormExpanded(true)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="業務名を入力..."
                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/40 placeholder-gray-400"
              />
              <button onClick={handleAdd} disabled={!input.trim()} className="p-1.5 rounded-lg bg-gray-100 hover:bg-[#A2C2D0]/20 text-[#7AAABB] disabled:opacity-40 transition-colors flex-shrink-0">
                <Plus size={16} />
              </button>
            </div>

            {/* 業務詳細・リンク（フォーカス時展開） */}
            {formExpanded && (
              <div className="flex flex-col gap-2 animate-[fade-in_0.2s_ease-out] border border-gray-100 rounded-xl p-2.5 bg-gray-50/60">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">業務詳細</label>
                  <textarea
                    value={details} onChange={e => setDetails(e.target.value)}
                    placeholder="詳細・メモ（任意）" rows={2}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#A2C2D0]/40 placeholder-gray-400 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">リンク</label>
                  {links.map(link => (
                    <div key={link.id} className="flex items-center gap-1.5 mb-1 px-2 py-1 bg-white rounded-lg border border-gray-100">
                      <LinkSvgIcon size={10} className="text-[#5AAAC5] flex-shrink-0" />
                      <span className="text-xs text-gray-600 flex-1 truncate">{link.title || link.url}</span>
                      <button type="button" onClick={() => setLinks(prev => prev.filter(l => l.id !== link.id))} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  <LinkInputRow onAdd={link => setLinks(prev => [...prev, link])} />
                </div>
                <div className="flex justify-end">
                  <button type="button"
                    onClick={() => { setFormExpanded(false); setDetails(''); setLinks([]) }}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    閉じる
                  </button>
                </div>
              </div>
            )}

            {items.length === 0 && <p className="text-xs text-gray-400 text-center py-1">項目なし</p>}
            {items.map(item => (
              <div key={item.id}
                className="flex items-start gap-2 bg-gray-50 hover:bg-[#FAF7F2] rounded-xl px-3 py-2 text-sm text-gray-700 group transition-colors cursor-pointer"
                onClick={() => onEdit(item, category.id)}>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-700 leading-snug">{item.text}</span>
                  {item.details && (
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug whitespace-pre-line">{item.details}</p>
                  )}
                  {item.links?.length > 0 && (
                    <div className="flex flex-col gap-0.5 mt-1">
                      {item.links.map(link => (
                        <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-[#5AAAC5] hover:underline w-fit">
                          <LinkSvgIcon size={10} />{link.title || link.url}
                        </a>
                      ))}
                    </div>
                  )}
                  {item.memo && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{item.memo}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                  <button
                    onClick={e => { e.stopPropagation(); onEdit(item, category.id) }}
                    className="p-1 text-gray-400 hover:text-[#7AAABB] rounded hover:bg-[#A2C2D0]/15 transition-colors"
                    title="編集">
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(category.id, item.id) }}
                    className="p-1 text-gray-400 hover:text-red-400 rounded hover:bg-red-50 transition-colors"
                    title="削除">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── リンクアイコン（シンプルSVG）─────────────────────────
function LinkSvgIcon({ size = 12, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5L7 4" />
      <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5L9 12" />
    </svg>
  )
}

// ─── TaskRow ─────────────────────────────────────────────
function TaskRow({ task, onStatusChange, onDelete, onToggleDone, onEdit }) {
  const isDone = task.status === 'done'
  const links = task.links || []

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 transition-all duration-200 hover:bg-[#FAF7F2]/70 group ${isDone ? 'opacity-50' : ''}`}>
      <DoneToggle isDone={isDone} onClick={() => onToggleDone(task.id, isDone)} />

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* タイトル */}
        <span className={`text-sm font-medium text-gray-800 leading-snug ${isDone ? 'line-through text-gray-400' : ''}`}>
          {task.title}
        </span>

        {/* 詳細テキスト */}
        {task.details && (
          <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line">{task.details}</p>
        )}

        {/* バッジ行 */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={task.status} onChange={s => onStatusChange(task.id, s)} />
          {task.dueDate && <span className="text-xs text-gray-400">📅 {task.dueDate}</span>}
        </div>

        {/* 関連リンク */}
        {links.length > 0 && (
          <div className="flex flex-col gap-1 mt-0.5">
            {links.map(link => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[#5AAAC5] hover:text-[#3A8AAE] hover:underline w-fit"
              >
                <LinkSvgIcon size={11} />
                {link.title || link.url}
              </a>
            ))}
          </div>
        )}

        {/* 進捗メモ（スプレッドシートの備考列相当） */}
        {task.memo && (
          <div className="mt-1 px-2.5 py-1.5 bg-[#FBF5E6] rounded-lg border-l-2 border-[#D4B86B]">
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{task.memo}</p>
          </div>
        )}
      </div>

      {/* 操作ボタン */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex-shrink-0">
        <button onClick={() => onEdit(task)} className="p-1.5 text-gray-400 hover:text-[#A2C2D0] rounded-lg hover:bg-[#A2C2D0]/10 transition-colors" title="編集">
          <Pencil size={13} />
        </button>
        {isDone && (
          <button onClick={() => onToggleDone(task.id, isDone)} className="p-1.5 text-gray-400 hover:text-[#7AAABB] rounded-lg hover:bg-[#A2C2D0]/10 transition-colors" title="リストに戻す">
            <RotateCcw size={13} />
          </button>
        )}
        <button onClick={() => onDelete(task.id)} className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-50 transition-colors" title="削除">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── リンク入力行（フォーム/モーダル共通）────────────────
function LinkInputRow({ onAdd }) {
  const [url, setUrl]     = useState('')
  const [title, setTitle] = useState('')
  const handleAdd = () => {
    const u = url.trim()
    if (!u) return
    onAdd({ id: Date.now().toString(), url: u.startsWith('http') ? u : `https://${u}`, title: title.trim() || u })
    setUrl(''); setTitle('')
  }
  return (
    <div className="flex gap-1.5 items-center">
      <input
        type="text" value={url} onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleAdd()}
        placeholder="URL"
        className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-[#A2C2D0]/20 bg-white/80 focus:outline-none focus:ring-1 focus:ring-[#A2C2D0]/40 placeholder-gray-400 min-w-0"
      />
      <input
        type="text" value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleAdd()}
        placeholder="表示名"
        className="w-24 text-xs px-2.5 py-1.5 rounded-lg border border-[#A2C2D0]/20 bg-white/80 focus:outline-none focus:ring-1 focus:ring-[#A2C2D0]/40 placeholder-gray-400"
      />
      <button onClick={handleAdd} className="p-1.5 rounded-lg bg-[#A2C2D0]/20 hover:bg-[#A2C2D0]/40 text-[#7AAABB] transition-colors flex-shrink-0">
        <Plus size={14} />
      </button>
    </div>
  )
}

// ─── DashboardItemEditModal ───────────────────────────────
function DashboardItemEditModal({ item, onSave, onClose }) {
  const [title, setTitle]     = useState(item.text || '')
  const [details, setDetails] = useState(item.details || '')
  const [memo, setMemo]       = useState(item.memo || '')
  const [links, setLinks]     = useState(item.links || [])

  const handleSave = () => {
    if (!title.trim()) return
    onSave({ title: title.trim(), details: details.trim(), memo: memo.trim(), links })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#A2C2D0]/20 w-full sm:max-w-lg max-h-[92vh] overflow-y-auto flex flex-col"
        style={{ background: 'linear-gradient(160deg, rgba(162,194,208,0.06) 0%, #ffffff 40%)' }}>

        <div className="sticky top-0 bg-white/95 backdrop-blur-sm flex items-center justify-between px-6 py-4 border-b border-[#F0EBE3] z-10">
          <h2 className="font-semibold text-gray-800 text-sm">詳細編集</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5 flex-1">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">タイトル</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full text-sm font-medium px-4 py-2.5 rounded-xl border-2 border-[#A2C2D0]/25 bg-white focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/40 focus:border-[#A2C2D0]/50 transition-all" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">詳細</label>
            <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} placeholder="タスクの詳細"
              className="w-full text-sm px-4 py-2.5 rounded-xl border border-[#A2C2D0]/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/30 placeholder-gray-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">進捗メモ</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} placeholder="備考・進捗状況"
              className="w-full text-sm px-4 py-2.5 rounded-xl border border-[#A2C2D0]/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/30 placeholder-gray-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">関連リンク</label>
            <div className="flex flex-col gap-1.5 mb-2">
              {links.map(link => (
                <div key={link.id} className="flex items-center gap-2 px-3 py-2 bg-[#F8F4F0] rounded-lg border border-[#A2C2D0]/15 group">
                  <LinkSvgIcon size={12} className="text-[#5AAAC5] flex-shrink-0" />
                  <a href={link.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[#5AAAC5] hover:underline flex-1 truncate">{link.title || link.url}</a>
                  <button onClick={() => setLinks(prev => prev.filter(l => l.id !== link.id))}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all flex-shrink-0">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <LinkInputRow onAdd={link => setLinks(prev => [...prev, link])} />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm px-6 py-4 border-t border-[#F0EBE3] flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={!title.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-[#A2C2D0] text-white hover:bg-[#7AAABB] disabled:opacity-40 transition-colors active:scale-95">
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TaskInputForm ────────────────────────────────────────
function TaskInputForm({ onAdd }) {
  const [title, setTitle]       = useState('')
  const [details, setDetails]   = useState('')
  const [memo, setMemo]         = useState('')
  const [status, setStatus]     = useState('doing')
  const [dueDate, setDueDate]   = useState('')
  const [links, setLinks]       = useState([])
  const [open, setOpen]         = useState(true)
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef(null)
  const suppressExpand = useRef(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    const v = title.trim()
    if (!v) return
    onAdd({ title: v, details: details.trim(), memo: memo.trim(), status, dueDate, links })
    setTitle(''); setDetails(''); setMemo(''); setStatus('doing')
    setDueDate(''); setLinks([]); setExpanded(false)
    suppressExpand.current = true
    inputRef.current?.focus()
    setTimeout(() => { suppressExpand.current = false }, 100)
  }

  return (
    <div className="relative pt-9">
      <CatEarsDecor position="top-center" color="#A2C2D0" />
      <div className="rounded-3xl border-2 border-[#A2C2D0] overflow-hidden">

        {/* ヘッダー */}
        <button onClick={() => { setOpen(v => !v); if (open) setExpanded(false) }} className="w-full">
          <div className="flex items-end justify-between px-4 pb-2 pt-2" style={{ backgroundColor: '#A2C2D0', minHeight: 64 }}>
            <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
              <span className="text-base">✏️</span>
              タスクを追加
            </div>
            {open ? <ChevronUp size={15} className="text-gray-500 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-500 flex-shrink-0" />}
          </div>
        </button>

        {/* フォーム本体 */}
        {open && <div className="bg-white px-4 pt-3 pb-4">
          <form onSubmit={handleSubmit}>
            <div className="flex gap-2">
              <input ref={inputRef} type="text" value={title} onChange={e => setTitle(e.target.value)}
                onFocus={() => { if (!suppressExpand.current) setExpanded(true) }}
                placeholder="タスク名を入力..."
                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/40 placeholder-gray-400"
              />
              <button type="submit" disabled={!title.trim()}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-[#A2C2D0]/20 text-[#7AAABB] disabled:opacity-40 transition-colors flex-shrink-0">
                <Plus size={16} />
              </button>
            </div>

            {expanded && (
              <div className="flex flex-col gap-2 mt-2 animate-[fade-in_0.2s_ease-out] border border-gray-100 rounded-xl p-2.5 bg-gray-50/60">
                {/* 詳細 */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">詳細</label>
                  <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="タスクの詳細（任意）" rows={2}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#A2C2D0]/40 placeholder-gray-400 resize-none" />
                </div>

                {/* 進捗メモ */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">進捗メモ</label>
                  <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="備考・進捗状況（任意）" rows={2}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#A2C2D0]/40 placeholder-gray-400 resize-none" />
                </div>

                {/* 関連リンク */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">関連リンク</label>
                  {links.map(link => (
                    <div key={link.id} className="flex items-center gap-1.5 mb-1 px-2 py-1 bg-white rounded-lg border border-gray-100">
                      <LinkSvgIcon size={10} className="text-[#5AAAC5] flex-shrink-0" />
                      <span className="text-xs text-gray-600 flex-1 truncate">{link.title}</span>
                      <button type="button" onClick={() => setLinks(prev => prev.filter(l => l.id !== link.id))} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  <LinkInputRow onAdd={link => setLinks(prev => [...prev, link])} />
                </div>

                {/* ステータス・期限 */}
                <div className="flex gap-x-4 gap-y-2 flex-wrap items-center pt-1 border-t border-gray-100">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="font-medium">ステータス</span>
                    <StatusBadge status={status} onChange={setStatus} />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
                    <span className="font-medium">期限</span>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#A2C2D0]/40" />
                  </div>
                </div>

              </div>
            )}
          </form>
        </div>}
      </div>
    </div>
  )
}

// ─── TaskEditModal ────────────────────────────────────────
function TaskEditModal({ task, onSave, onClose }) {
  const [title, setTitle]       = useState(task.title || '')
  const [details, setDetails]   = useState(task.details || '')
  const [memo, setMemo]         = useState(task.memo || '')
  const [status, setStatus]     = useState(task.status || 'doing')
  const [dueDate, setDueDate]   = useState(task.dueDate || '')
  const [links, setLinks]       = useState(task.links || [])

  const handleSave = () => {
    if (!title.trim()) return
    onSave(task.id, { title: title.trim(), details: details.trim(), memo: memo.trim(), status, dueDate, links })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* バックドロップ */}
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />

      {/* モーダルカード */}
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#A2C2D0]/20 w-full sm:max-w-lg max-h-[92vh] overflow-y-auto flex flex-col"
        style={{ background: 'linear-gradient(160deg, rgba(162,194,208,0.06) 0%, #ffffff 40%)' }}>

        {/* ヘッダー */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm flex items-center justify-between px-6 py-4 border-b border-[#F0EBE3] z-10">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-800 text-sm">タスクを編集</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* フォーム */}
        <div className="p-6 flex flex-col gap-5 flex-1">

          {/* タイトル */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">タイトル</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full text-sm font-medium px-4 py-2.5 rounded-xl border-2 border-[#A2C2D0]/25 bg-white focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/40 focus:border-[#A2C2D0]/50 transition-all" />
          </div>

          {/* 詳細 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">詳細</label>
            <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} placeholder="タスクの詳細"
              className="w-full text-sm px-4 py-2.5 rounded-xl border border-[#A2C2D0]/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/30 placeholder-gray-400 resize-none" />
          </div>

          {/* 進捗メモ */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">進捗メモ</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} placeholder="備考・進捗状況"
              className="w-full text-sm px-4 py-2.5 rounded-xl border border-[#A2C2D0]/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#A2C2D0]/30 placeholder-gray-400 resize-none" />
          </div>

          {/* ステータス + 期限 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">ステータス</label>
              <StatusBadge status={status} onChange={setStatus} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">期限</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-lg border border-[#A2C2D0]/20 bg-white focus:outline-none focus:ring-1 focus:ring-[#A2C2D0]/40 w-full" />
            </div>
          </div>

          {/* 関連リンク */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">関連リンク</label>
            <div className="flex flex-col gap-1.5 mb-2">
              {links.map(link => (
                <div key={link.id} className="flex items-center gap-2 px-3 py-2 bg-[#F8F4F0] rounded-lg border border-[#A2C2D0]/15 group">
                  <LinkSvgIcon size={12} className="text-[#5AAAC5] flex-shrink-0" />
                  <a href={link.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[#5AAAC5] hover:underline flex-1 truncate">{link.title || link.url}</a>
                  <button onClick={() => setLinks(prev => prev.filter(l => l.id !== link.id))}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all flex-shrink-0">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <LinkInputRow onAdd={link => setLinks(prev => [...prev, link])} />
          </div>
        </div>

        {/* フッターボタン */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm px-6 py-4 border-t border-[#F0EBE3] flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={!title.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-[#A2C2D0] text-white hover:bg-[#7AAABB] disabled:opacity-40 transition-colors active:scale-95">
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── SyncIndicator ────────────────────────────────────────
function SyncIndicator({ status }) {
  const configs = {
    loading: { text: '読み込み中', className: 'text-gray-400 bg-gray-50', icon: <Cloud size={11} className="animate-pulse" /> },
    saving:  { text: '保存中',    className: 'text-[#7AAABB] bg-[#A2C2D0]/15', icon: <Cloud size={11} /> },
    synced:  { text: '同期済み',  className: 'text-[#4A9E68] bg-[#EAF6EF]',   icon: <Cloud size={11} /> },
    error:   { text: 'オフライン', className: 'text-[#E5807A] bg-[#FDF0EF]',   icon: <CloudOff size={11} /> },
  }
  const cfg = configs[status] ?? configs.loading
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-medium text-xs ${cfg.className}`}>
      {cfg.icon}
      <span className="hidden sm:inline">{cfg.text}</span>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────
function EmptyState() {
  return (
    <div className="py-14 text-center flex flex-col items-center gap-3">
      <div className="flex gap-4 text-3xl mb-1"><span>🍜</span><span>📷</span><span>🎸</span><span>🎀</span></div>
      <p className="text-sm text-gray-400 font-medium">タスクはありません</p>
    </div>
  )
}

// ─── メインアプリ ──────────────────────────────────────────
export default function App() {
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? [] } catch { return [] }
  })
  const [dashboard, setDashboard] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DASHBOARD_KEY) ?? 'null') ?? { routine: [], adhoc: [], schedule: [] } } catch { return { routine: [], adhoc: [], schedule: [] } }
  })
  const [dashboardOpen, setDashboardOpen] = useState(true)
  const [tasksOpen, setTasksOpen]         = useState(true)
  const [archiveOpen, setArchiveOpen]     = useState(false)
  const [toast, setToast]                 = useState(null)
  const [filter, setFilter]               = useState('all')
  const [editingTask, setEditingTask]             = useState(null)
  const [editingDashItem, setEditingDashItem]     = useState(null) // { item, catId }
  const [syncStatus, setSyncStatus]               = useState('loading')
  const [hasLoaded, setHasLoaded]                 = useState(false)
  const syncTimerRef = useRef(null)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)) }, [tasks])
  useEffect(() => { localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dashboard)) }, [dashboard])

  // Google Sheets から初回読み込み
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(SHEETS_API_URL)
        const text = await res.text()
        if (text && text.trim() !== '{}') {
          const data = JSON.parse(text)
          if (Array.isArray(data.tasks)) setTasks(data.tasks)
          if (data.dashboard && typeof data.dashboard === 'object') setDashboard(data.dashboard)
        }
        setSyncStatus('synced')
      } catch {
        setSyncStatus('error')
      }
      setHasLoaded(true)
    }
    load()
  }, [])

  // データ変更時に Google Sheets へ同期（1.5秒デバウンス）
  useEffect(() => {
    if (!hasLoaded) return
    setSyncStatus('saving')
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      try {
        await fetch(SHEETS_API_URL, {
          method: 'POST',
          mode: 'no-cors',
          body: JSON.stringify({ tasks, dashboard, savedAt: new Date().toISOString() }),
        })
        setSyncStatus('synced')
      } catch {
        setSyncStatus('error')
      }
    }, 1500)
  }, [tasks, dashboard, hasLoaded])

  const addTask = (fields) => {
    setTasks(prev => [{
      id: Date.now().toString(),
      title: fields.title, details: fields.details || '', memo: fields.memo || '',
      status: fields.status, dueDate: fields.dueDate || '',
      links: fields.links || [],
      createdAt: new Date().toISOString(), completedAt: null,
    }, ...prev])
    setToast(TOAST_MSGS.add)
  }

  const editTask = (id, fields) => {
    setTasks(prev => prev.map(t => t.id !== id ? t : {
      ...t, ...fields,
      completedAt: fields.status === 'done' && t.status !== 'done' ? new Date().toISOString()
                 : fields.status !== 'done' ? null : t.completedAt,
    }))
    setToast(TOAST_MSGS.edit)
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
    } else { changeStatus(id, 'done') }
  }

  const deleteTask = (id) => setTasks(prev => prev.filter(t => t.id !== id))

  const addDashboardItem = (catId, text, details = '', links = []) =>
    setDashboard(prev => ({ ...prev, [catId]: [...(prev[catId] || []), { id: Date.now().toString(), text, details, memo: '', links }] }))
  const deleteDashboardItem = (catId, itemId) =>
    setDashboard(prev => ({ ...prev, [catId]: (prev[catId] || []).filter(i => i.id !== itemId) }))
  const updateDashboardItem = (catId, itemId, fields) => {
    setDashboard(prev => ({
      ...prev,
      [catId]: (prev[catId] || []).map(item =>
        item.id !== itemId ? item : { ...item, text: fields.title, details: fields.details, memo: fields.memo, links: fields.links }
      ),
    }))
    setToast(TOAST_MSGS.edit)
  }

  const activeTasks    = tasks.filter(t => t.status !== 'done')
  const doneTasks      = tasks.filter(t => t.status === 'done').sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
  const filteredActive = filter === 'all' ? activeTasks : activeTasks.filter(t => t.status === filter)
  const todayDone      = doneTasks.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString()).length

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-20" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>

      {/* ヘッダー */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#A2C2D0]/25 shadow-[0_2px_12px_rgba(162,194,208,0.18)]">
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <img src={catLogo} alt="Koto Note" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800 text-base leading-tight tracking-wide">Koto Note</h1>
              <p className="text-xs text-gray-400 tracking-wider">TASK MANAGER</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-[#A2C2D0]/15 px-3 py-1.5 rounded-full text-[#7AAABB] font-medium">
                <Clock size={11} />進行中 {activeTasks.filter(t => t.status === 'doing').length}
              </div>
              <div className="flex items-center gap-1.5 bg-[#EAF6EF] px-3 py-1.5 rounded-full text-[#4A9E68] font-medium">
                <CheckCircle2 size={11} />今日 {todayDone}件完了
              </div>
            </div>
            <SyncIndicator status={syncStatus} />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-7 flex flex-col gap-7">

        {/* ダッシュボード */}
        <section>
          <button onClick={() => setDashboardOpen(v => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-700 mb-5 transition-colors tracking-widest uppercase">
            <img src={catLogo} alt="" className="w-5 h-5 object-contain" />
            ダッシュボード
            <span className="text-gray-300">{dashboardOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
          </button>
          {dashboardOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-[fade-in_0.3s_ease-out]">
              {DASHBOARD_CATEGORIES.map(cat => (
                <DashboardCard key={cat.id} category={cat} items={dashboard[cat.id] || []}
                  onAdd={addDashboardItem} onDelete={deleteDashboardItem}
                  onEdit={(item, catId) => setEditingDashItem({ item, catId })} />
              ))}
            </div>
          )}
        </section>

        {/* タスク入力 */}
        <section><TaskInputForm onAdd={addTask} /></section>

        {/* アクティブタスク */}
        <section>
          <div className="relative pt-9">
            <CatEarsDecor position="top-left" color="#C4BAD8" />
            <div className="rounded-3xl border-2 border-[#C4BAD8] overflow-hidden">

              {/* ヘッダー */}
              <button onClick={() => setTasksOpen(v => !v)} className="w-full">
                <div className="flex items-end justify-between px-4 pb-2 pt-2" style={{ backgroundColor: '#C4BAD8', minHeight: 64 }}>
                  <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
                    <img src={catLogo} alt="" className="w-5 h-5 object-contain" />
                    タスク
                    <span className="text-xs font-normal bg-white/70 px-2 py-0.5 rounded-full text-gray-500">
                      {filteredActive.length}件
                    </span>
                  </div>
                  {tasksOpen ? <ChevronUp size={15} className="text-gray-500 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-500 flex-shrink-0" />}
                </div>
              </button>

              {tasksOpen && (
                <div className="bg-white">
                  {/* フィルターボタン */}
                  <div className="px-4 pt-3 pb-2 flex items-center gap-1 flex-wrap border-b border-[#F5F0EB]">
                    <button onClick={() => setFilter('all')} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${filter === 'all' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-100'}`}>すべて</button>
                    {STATUS_ORDER.filter(s => s !== 'done').map(s => {
                      const cfg = STATUS_CONFIG[s]
                      const count = activeTasks.filter(t => t.status === s).length
                      return (
                        <button key={s} onClick={() => setFilter(s)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${filter === s ? `${cfg.color} border` : 'text-gray-400 hover:bg-gray-50'}`}>
                          {cfg.label}{count > 0 && ` ${count}`}
                        </button>
                      )
                    })}
                  </div>

                  {/* タスクリスト */}
                  {filteredActive.length === 0 ? <EmptyState /> : (
                    <div className="flex flex-col divide-y divide-[#F5F0EB]">
                      {filteredActive.map(task => (
                        <TaskRow key={task.id} task={task}
                          onStatusChange={changeStatus} onDelete={deleteTask}
                          onToggleDone={toggleDone} onEdit={setEditingTask} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 完了済みアーカイブ */}
        {doneTasks.length > 0 && (
          <section>
            <button onClick={() => setArchiveOpen(v => !v)}
              className="flex items-center gap-2 w-full text-xs font-semibold text-gray-400 hover:text-gray-600 mb-4 transition-colors tracking-widest uppercase">
              <Archive size={13} className="text-[#8FC8A4]" />完了済み
              <span className="bg-[#F0EBE3] px-2 py-0.5 rounded-full normal-case tracking-normal font-normal text-gray-400">{doneTasks.length}件</span>
              <span className="ml-auto text-gray-300">{archiveOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
            </button>
            {archiveOpen && (
              <div className="bg-white/60 rounded-2xl border border-[#A2C2D0]/15 animate-[fade-in_0.3s_ease-out]">
                <div className="px-4 py-3 border-b border-[#F0EBE3]"><p className="text-xs text-gray-400 text-center">完了済みのタスク</p></div>
                <div className="flex flex-col divide-y divide-[#F5F0EB]">
                  {doneTasks.map(task => (
                    <TaskRow key={task.id} task={task}
                      onStatusChange={changeStatus} onDelete={deleteTask}
                      onToggleDone={toggleDone} onEdit={setEditingTask} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* タスク編集モーダル */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onSave={editTask}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* ダッシュボードアイテム編集モーダル */}
      {editingDashItem && (
        <DashboardItemEditModal
          item={editingDashItem.item}
          onSave={fields => updateDashboardItem(editingDashItem.catId, editingDashItem.item.id, fields)}
          onClose={() => setEditingDashItem(null)}
        />
      )}

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
