import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo, useCallback, Component } from 'react'
import {
  Plus, ChevronDown, ChevronUp, Trash2, CheckCircle2,
  Clock, Search,
  Pencil, X, Check, Cloud, CloudOff, LogOut, Settings, ExternalLink
} from 'lucide-react'
import catLogo from './assets/cat_Image.png'
import catBlack from './assets/cat_black.png'
import catOrange from './assets/cat_orange.png'
import './index.css'

// ─── ユーティリティ ──────────────────────────────────────
const normalizeUrl = (url) => {
  const u = url.trim()
  if (!u) return ''
  try {
    const parsed = new URL(u.startsWith('http') ? u : `https://${u}`)
    if (!['http:', 'https:'].includes(parsed.protocol)) return ''
    return parsed.href
  } catch {
    return ''
  }
}

// ─── 定数 ───────────────────────────────────────────────
const GIS_CLIENT_ID     = import.meta.env.VITE_GIS_CLIENT_ID ?? ''
const SHEETS_API_BASE   = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE_API_FILES   = 'https://www.googleapis.com/drive/v3/files'
const SPREADSHEET_TITLE = 'Koto Note'

function getStorageKeys(email) {
  // メールアドレスをそのままキーに使う（localStorageキーは任意文字列を受け付けるため衝突なし）
  const safe = email ?? 'anonymous'
  return {
    tasks:          `hachiware-tasks-${safe}-v2`,
    dashboard:      `hachiware-dashboard-${safe}-v2`,
    procedures:     `hachiware-procedures-${safe}-v2`,
    ssId:           `hachiware-ss-id-${safe}`,
    spreadsheetUrl: `hachiware-spreadsheet-url-${safe}`,
  }
}

// v1形式の旧キー（@と.を_に変換）→ v2形式へのマイグレーション
function migrateStorageKeys(email) {
  if (!email) return
  const oldSafe = email.replace(/[@.]/g, '_')
  const newSafe = email
  const keyPairs = [
    [`hachiware-tasks-${oldSafe}-v1`,          `hachiware-tasks-${newSafe}-v2`],
    [`hachiware-dashboard-${oldSafe}-v1`,       `hachiware-dashboard-${newSafe}-v2`],
    [`hachiware-procedures-${oldSafe}-v1`,      `hachiware-procedures-${newSafe}-v2`],
    [`hachiware-ss-id-${oldSafe}`,              `hachiware-ss-id-${newSafe}`],
    [`hachiware-spreadsheet-url-${oldSafe}`,    `hachiware-spreadsheet-url-${newSafe}`],
  ]
  keyPairs.forEach(([oldKey, newKey]) => {
    if (localStorage.getItem(newKey) === null) {
      const val = localStorage.getItem(oldKey)
      if (val !== null) {
        localStorage.setItem(newKey, val)
        localStorage.removeItem(oldKey)
      }
    }
  })
}

// ─── Google Sheets API ヘルパー ─────────────────────────
async function sheetsApi(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    console.error('[SheetsAPI]', method, res.status, errBody)
    const err = new Error(`${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// 旧タブ名「手順書」→「リンク」マイグレーション
async function migrateSheetNames(token, ssId) {
  const info = await sheetsApi('GET', `${SHEETS_API_BASE}/${ssId}?fields=sheets.properties(sheetId,title)`, token)
  const sheets    = info.sheets || []
  const procSheet = sheets.find(s => s.properties.title === '手順書')
  const hasLink   = sheets.some(s => s.properties.title === 'リンク')
  if (procSheet && !hasLink) {
    await sheetsApi('POST', `${SHEETS_API_BASE}/${ssId}:batchUpdate`, token, {
      requests: [{ updateSheetProperties: {
        properties: { sheetId: procSheet.properties.sheetId, title: 'リンク' },
        fields: 'title',
      }}],
    })
  }
}

async function getOrCreateSpreadsheet(token, ssIdKey) {
  let ssId = localStorage.getItem(ssIdKey)
  let driveApiDisabled = false

  // Drive検索を常に実行し、アクティブな「Koto Note」を正規IDとして使用
  // 複数存在する場合（例：PC作成 + 携帯が誤って作成した空のもの）：
  //   1. タスクの更新日時（列J）が最新のものをアクティブとみなす
  //   2. 更新日時が同じ（どれも空など）なら行数が多いものを優先
  //   3. 同じ行数なら最近更新されたもの（Drive結果の先頭）を採用
  try {
    const q = `name='${SPREADSHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
    const res = await fetch(`${DRIVE_API_FILES}?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=modifiedTime+desc&pageSize=5`, {
      headers: { Authorization: 'Bearer ' + token },
    })
    if (res.ok) {
      const data = await res.json()
      const files = data.files ?? []
      if (files.length === 1) {
        ssId = files[0].id
      } else if (files.length > 1) {
        let bestId = files[0].id
        let bestTime = -1
        let bestRows = -1
        for (const file of files) {
          try {
            const r = await fetch(
              `${SHEETS_API_BASE}/${file.id}/values/${encodeURIComponent('タスク!A2:J')}`,
              { headers: { Authorization: 'Bearer ' + token } }
            )
            if (r.ok) {
              const d = await r.json()
              const rows = d.values ?? []
              let maxTime = 0
              for (const row of rows) {
                const ts = row[9] ? (new Date(row[9]).getTime() || 0) : 0
                if (ts > maxTime) maxTime = ts
              }
              if (maxTime > bestTime || (maxTime === bestTime && rows.length > bestRows)) {
                bestTime = maxTime; bestRows = rows.length; bestId = file.id
              }
            }
          } catch {}
        }
        ssId = bestId
      }
    } else {
      const errText = await res.text().catch(() => '')
      if (errText.includes('SERVICE_DISABLED') || errText.includes('accessNotConfigured')) {
        driveApiDisabled = true
      }
    }
  } catch {}

  if (ssId) {
    try { await migrateSheetNames(token, ssId) } catch {}
    localStorage.setItem(ssIdKey, ssId)
    return { ssId, driveApiDisabled }
  }
  // マイドライブに新規作成
  const ss = await sheetsApi('POST', SHEETS_API_BASE, token, {
    properties: { title: SPREADSHEET_TITLE },
    sheets: [
      { properties: { title: 'タスク' } },
      { properties: { title: 'ダッシュボード' } },
      { properties: { title: 'リンク' } },
    ],
  })
  // ヘッダー行を設定
  await sheetsApi('POST', `${SHEETS_API_BASE}/${ss.spreadsheetId}/values:batchUpdate`, token, {
    valueInputOption: 'RAW',
    data: [
      { range: 'タスク!A1:J1',       values: [['ID','タイトル','詳細','進捗メモ','ステータス','期限','リンク','作成日時','完了日時','更新日時']] },
      { range: 'ダッシュボード!A1:G1', values: [['ID','カテゴリ','業務名','詳細','進捗メモ','リンク','スケジュール']] },
      { range: 'リンク!A1:F1',        values: [['カテゴリID','カテゴリ名','アイテムID','表示名','URL','備考']] },
    ],
  })
  localStorage.setItem(ssIdKey, ss.spreadsheetId)
  return { ssId: ss.spreadsheetId, driveApiDisabled }
}

function safeParseJSON(str, fallback) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

async function loadFromSheets(token, ssId) {
  const res = await sheetsApi('GET',
    `${SHEETS_API_BASE}/${ssId}/values:batchGet?ranges=${encodeURIComponent('タスク!A2:J')}&ranges=${encodeURIComponent('ダッシュボード!A2:G')}&ranges=${encodeURIComponent('リンク!A2:F')}`,
    token)
  const [taskVals, dashVals, procVals] = (res.valueRanges || []).map(r => r.values || [])

  const tasks = (taskVals || []).filter(r => r[0]).map(r => ({
    id: String(r[0]), title: r[1] || '', details: r[2] || '', memo: r[3] || '',
    status: r[4] || '', dueDate: r[5] || '',
    links: safeParseJSON(r[6], []),
    createdAt: r[7] || '', completedAt: r[8] || null,
    updatedAt: r[9] || '',
  }))

  const dashboard = { routine: [], adhoc: [], schedule: [] }
  ;(dashVals || []).filter(r => r[0]).forEach(r => {
    const catId = r[1]
    if (dashboard[catId]) {
      dashboard[catId].push({
        id: String(r[0]), text: r[2] || '', details: r[3] || '', memo: r[4] || '',
        links: safeParseJSON(r[5], []),
        recurrence: safeParseJSON(r[6], { type: 'none' }),
      })
    }
  })

  const catMap = {}
  ;(procVals || []).filter(r => r[0]).forEach(r => {
    const catId = String(r[0])
    if (!catMap[catId]) catMap[catId] = { id: catId, name: r[1] || '', items: [] }
    if (r[2]) catMap[catId].items.push({ id: String(r[2]), title: r[3] || '', url: r[4] || '', note: r[5] || '' })
  })
  const procedures = { categories: Object.values(catMap) }

  return { tasks, dashboard, procedures }
}

async function saveToSheets(token, ssId, { tasks, dashboard, procedures }) {
  await sheetsApi('POST', `${SHEETS_API_BASE}/${ssId}/values:batchClear`, token, {
    ranges: ['タスク!A2:J', 'ダッシュボード!A2:G', 'リンク!A2:F'],
  })
  const taskRows = tasks.map(t => [
    t.id, t.title, t.details || '', t.memo || '', t.status, t.dueDate || '',
    t.links?.length ? JSON.stringify(t.links) : '', t.createdAt || '', t.completedAt || '',
    t.updatedAt || '',
  ])
  const dashRows = []
  Object.entries(dashboard).forEach(([catId, items]) => {
    items.forEach(item => dashRows.push([
      item.id, catId, item.text, item.details || '', item.memo || '',
      item.links?.length ? JSON.stringify(item.links) : '',
      item.recurrence?.type !== 'none' ? JSON.stringify(item.recurrence) : '',
    ]))
  })
  const procRows = []
  procedures.categories?.forEach(cat => {
    if (cat.items?.length) {
      cat.items.forEach(item => procRows.push([cat.id, cat.name, item.id, item.title || '', item.url || '', item.note || '']))
    } else {
      procRows.push([cat.id, cat.name, '', '', '', ''])
    }
  })
  const data = []
  if (taskRows.length) data.push({ range: 'タスク!A2', values: taskRows })
  if (dashRows.length) data.push({ range: 'ダッシュボード!A2', values: dashRows })
  if (procRows.length) data.push({ range: 'リンク!A2', values: procRows })
  if (data.length) {
    await sheetsApi('POST', `${SHEETS_API_BASE}/${ssId}/values:batchUpdate`, token, {
      valueInputOption: 'RAW', data,
    })
  }
}

const STATUS_CONFIG = {
  doing:   { label: '🚀 doing',   color: 'text-[#2A6080] bg-[#A0C8DC] border-[#80B0C8]', dot: 'bg-[#2A6080]' },
  review:  { label: '💬 review',  color: 'text-[#703080] bg-[#F8C8D4] border-[#E8A0BC]', dot: 'bg-[#703080]' },
  pause:   { label: '⏸️ pause',   color: 'text-[#8A5020] bg-[#F8D4B8] border-[#E0B890]', dot: 'bg-[#8A5020]' },
  waiting: { label: '⏳ waiting', color: 'text-[#584090] bg-[#D4C8EC] border-[#B4A8D4]', dot: 'bg-[#584090]' },
  done:    { label: '💚 done',    color: 'text-[#2A7050] bg-[#B8E8D0] border-[#90D0B0]', dot: 'bg-[#2A7050]' },
}
const STATUS_ORDER = ['doing', 'review', 'pause', 'waiting', 'done']

const DASHBOARD_CATEGORIES = [
  { id: 'routine',  label: 'ルーチン業務', emoji: '🍜', borderColor: 'border-[#A0C8DC]', bgColor: 'from-[#A0C8DC]/10 to-[#A0C8DC]/5', color: '#A0C8DC', earPosition: 'top-left' },
  { id: 'adhoc',   label: '臨時対応',     emoji: '📷', borderColor: 'border-[#F8C0D8]', bgColor: 'from-[#F8C0D8]/10 to-[#F8C0D8]/5', color: '#F8C0D8', earPosition: 'top-center' },
  { id: 'schedule', label: '予定',         emoji: '🎸', borderColor: 'border-[#F0E080]', bgColor: 'from-[#F0E080]/20 to-[#F0E080]/5', color: '#F0E080', earPosition: 'top-right' },
]

// 星柄パターン（SVG data URI・散りばめ）
function starPatternUrl(hexColor, opacity = 0.13) {
  function pts(cx, cy, r, r2) {
    const p = []
    for (let i = 0; i < 5; i++) {
      const a1 = (i * 72 - 90) * Math.PI / 180
      const a2 = (i * 72 - 54) * Math.PI / 180
      p.push(`${(cx + r * Math.cos(a1)).toFixed(1)},${(cy + r * Math.sin(a1)).toFixed(1)}`)
      p.push(`${(cx + r2 * Math.cos(a2)).toFixed(1)},${(cy + r2 * Math.sin(a2)).toFixed(1)}`)
    }
    return p.join(' ')
  }
  const stars = [
    [20, 16, 8, 3.2], [82, 44, 6, 2.5], [140, 18, 7, 2.8],
    [52, 105, 7, 2.8], [115, 82, 8, 3.2], [30, 148, 6, 2.4],
    [148, 130, 7, 2.8], [88, 155, 5, 2.0],
  ]
  const polys = stars.map(([x, y, r, r2]) =>
    `<polygon points='${pts(x, y, r, r2)}' fill='${hexColor}' fill-opacity='${opacity}' stroke='${hexColor}' stroke-opacity='${opacity}' stroke-width='4.5' stroke-linejoin='round'/>`
  ).join('')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='170' height='170'>${polys}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// ちいかわキャラクターイメージ（カテゴリ別）
const CHIIKAWA_CARD_STYLES = {
  routine: {
    // ハチワレ：ブルー・きちんと感
    bg:        `${starPatternUrl('#6496E6')} repeat, linear-gradient(135deg, #F2F7FF 55%, #C8DCFF 100%)`,
    shadow:    '0 2px 10px rgba(90,130,210,0.18), 0 1px 2px rgba(0,0,0,0.04)',
    border:    '1.5px solid rgba(100,150,230,0.35)',
    iconBg:    'rgba(100,150,230,0.18)',
    chipColor: '#5080C0',
    imgFilter: 'sepia(1) hue-rotate(190deg) saturate(7.0) brightness(1.1)',
  },
  adhoc: {
    // うさぎ：ホットピンク・元気
    bg:        `${starPatternUrl('#E66496')} repeat, linear-gradient(135deg, #FFF5F8 55%, #FFD0E8 100%)`,
    shadow:    '0 2px 10px rgba(230,100,150,0.18), 0 1px 2px rgba(0,0,0,0.04)',
    border:    '1.5px solid rgba(240,130,170,0.38)',
    iconBg:    'rgba(248,150,185,0.25)',
    chipColor: '#C8508A',
    imgFilter: 'sepia(1) hue-rotate(310deg) saturate(3.5) brightness(1.1)',
  },
  schedule: {
    // うさぎ：クリーム・黄色・ほんわか
    bg:        `${starPatternUrl('#C8A820')} repeat, linear-gradient(135deg, #FFFDF0 55%, #FFF8B0 100%)`,
    shadow:    '0 2px 10px rgba(200,170,30,0.18), 0 1px 2px rgba(0,0,0,0.04)',
    border:    '1.5px solid rgba(210,190,50,0.42)',
    iconBg:    'rgba(240,220,80,0.28)',
    chipColor: '#A08010',
    imgFilter: 'sepia(1) hue-rotate(10deg) saturate(2.5) brightness(1.1)',
  },
}


const PROC_COLORS = ['#A8D8EC', '#F8C8D4', '#B8E8D0', '#F8D4B8', '#D4C8EC', '#FFD0E8']
const PROC_EAR_POSITIONS = ['top-left', 'top-center', 'top-right']

const TOAST_MSGS = { add: 'タスクを追加しました', done: '完了しました ✓', restore: 'リストに戻しました', edit: '保存しました', reconnect: '再接続が必要です。「クラウドに接続」をタップしてください。', driveDisabled: 'Google Drive API が無効です。Cloud Console で有効化してください。' }

// ─── スケジュール（繰り返し）ヘルパー ────────────────────
const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']
const WEEK_OF_MONTH_LABEL = ['', '第1', '第2', '第3', '第4', '第5']

function getRecurrencePresets(date) {
  const d = date || new Date()
  const wd  = d.getDay()
  const wom = Math.ceil(d.getDate() / 7)
  const m   = d.getMonth() + 1
  const day = d.getDate()
  return [
    { type: 'none',     label: '繰り返さない' },
    { type: 'daily',    label: '毎日' },
    { type: 'weekly',   label: `毎週 ${WEEKDAY_NAMES[wd]}曜`, weekday: wd },
    { type: 'monthly',      label: `毎月 ${WEEK_OF_MONTH_LABEL[wom]}${WEEKDAY_NAMES[wd]}曜`, weekOfMonth: wom, weekday: wd },
    { type: 'monthly_last', label: `毎月 最終${WEEKDAY_NAMES[wd]}曜`, weekday: wd },
    { type: 'yearly',       label: `毎年 ${m}月${day}日`, month: m, day },
    { type: 'weekdays', label: '毎週 平日（月〜金）' },
    { type: 'custom',   label: 'カスタム' },
  ]
}

function isItemToday(recurrence, today) {
  if (!recurrence || recurrence.type === 'none') return false
  const wd  = today.getDay()
  const wom = Math.ceil(today.getDate() / 7)
  const m   = today.getMonth() + 1
  const d   = today.getDate()
  switch (recurrence.type) {
    case 'daily':    return true
    case 'weekly':   return recurrence.weekday === wd
    case 'monthly':  return recurrence.weekOfMonth === wom && recurrence.weekday === wd
    case 'monthly_last': {
      const nextWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)
      return today.getDay() === recurrence.weekday && nextWeek.getMonth() !== today.getMonth()
    }
    case 'yearly':   return recurrence.month === m && recurrence.day === d
    case 'weekdays': return wd >= 1 && wd <= 5
    case 'custom':   return Array.isArray(recurrence.customDays) && recurrence.customDays.includes(wd)
    default:         return false
  }
}

function getRecurrenceLabel(rec) {
  if (!rec || rec.type === 'none') return null
  let base = ''
  switch (rec.type) {
    case 'daily':    base = '毎日'; break
    case 'weekly':   base = `毎週 ${WEEKDAY_NAMES[rec.weekday]}曜`; break
    case 'monthly':      base = `毎月 ${WEEK_OF_MONTH_LABEL[rec.weekOfMonth]}${WEEKDAY_NAMES[rec.weekday]}曜`; break
    case 'monthly_last': base = `毎月 最終${WEEKDAY_NAMES[rec.weekday]}曜`; break
    case 'yearly':   base = `毎年 ${rec.month}月${rec.day}日`; break
    case 'weekdays': base = '毎週 平日（月〜金）'; break
    case 'custom': {
      if (!rec.customDays?.length) { base = 'カスタム'; break }
      base = `毎週 ${[...rec.customDays].sort((a,b)=>a-b).map(d => WEEKDAY_NAMES[d]).join('・')}曜`; break
    }
    default: return null
  }
  if (rec.startTime) {
    base += ` ${rec.startTime}`
    if (rec.endTime) base += `〜${rec.endTime}`
  }
  return base
}

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

// ─── カスタムフック ──────────────────────────────────────
function useEscapeKey(onClose) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') ref.current() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
}

// ─── 検索ハイライト ────────────────────────────────────────
function Highlight({ text, query }) {
  if (!query || !text) return <>{text}</>
  const parts = []
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let last = 0, idx
  while ((idx = lower.indexOf(q, last)) !== -1) {
    if (idx > last) parts.push({ t: text.slice(last, idx), m: false })
    parts.push({ t: text.slice(idx, idx + q.length), m: true })
    last = idx + q.length
  }
  if (last < text.length) parts.push({ t: text.slice(last), m: false })
  return <>{parts.map((p, i) => p.m
    ? <mark key={i} className="bg-yellow-200 text-inherit rounded-sm not-italic">{p.t}</mark>
    : <span key={i}>{p.t}</span>
  )}</>
}

// ─── 猫耳 × 2 ────────────────────────────────────────────
// 低めの高さ + 幅広のQベジエで「ふっくら丸みのある猫耳」を表現
function CatEarsDecor({ color, position }) {
  const posClass = {
    'top-left':   'absolute top-1 left-3',
    'top-center': 'absolute top-1 left-1/2 -translate-x-1/2',
    'top-right':  'absolute top-1 right-3',
  }[position] ?? ''

  const [piku, setPiku] = useState(false)

  useEffect(() => {
    const trigger = () => {
      // カードごとにランダムな遅延（0〜2秒）でバラバラ感を演出
      const delay = Math.random() * 2000
      setTimeout(() => {
        setPiku(true)
        setTimeout(() => setPiku(false), 600)
      }, delay)
    }
    trigger() // ページ表示時に1回
    const id = setInterval(trigger, 30000) // 以降30秒ごと
    return () => clearInterval(id)
  }, [])

  return (
    // style={{ color }} → fill="currentColor" が参照 → CSS変数と完全同期
    <div className={`pointer-events-none ${posClass}`} aria-hidden="true" style={{ color }}>
      <svg
        width="116" height="41" viewBox="0 0 54 18"
        className={piku ? 'animate-pikupiku' : ''}
        style={{ transformOrigin: 'bottom center' }}
      >
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
        : <div className="w-[18px] h-[18px] rounded-full border-2 border-[#A0C8DC] hover:border-[#4A9E68] transition-colors" />
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

  // ドロップダウンの表示位置をボタン基準で計算（画面下端に近い場合は上方向に開く）
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const openDropdown = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const DROPDOWN_H = STATUS_ORDER.length * 34 + 12
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow >= DROPDOWN_H ? rect.bottom + 4 : rect.top - DROPDOWN_H - 4
      setDropPos({ top, left: rect.left })
    }
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={openDropdown}
        className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer select-none transition-all duration-150 ${cfg.color} hover:opacity-80`}
      >
        {cfg.label}
        <ChevronDown size={10} />
      </button>
      {open && (
        <>
          {/* バックドロップ：外クリックで確実に閉じる */}
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[9999] bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#A0C8DC]/20 p-1.5 flex flex-col gap-0.5 min-w-[110px]"
            style={{ top: dropPos.top, left: dropPos.left }}
          >
            {STATUS_ORDER.map(s => {
              const c = STATUS_CONFIG[s]
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => { onChange(s); setOpen(false) }}
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer w-full ${c.color} hover:opacity-80 ${s === status ? 'ring-1 ring-offset-1 ring-current' : ''}`}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

// ─── Toast ───────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-[fade-in_0.3s_ease-out]">
      <div className="bg-white border border-[#A0C8DC]/30 shadow-[0_4px_20px_rgba(160,200,220,0.20)] rounded-2xl px-5 py-3 flex items-center gap-3 text-sm font-medium text-gray-700">
        {msg}
      </div>
    </div>
  )
}

// ─── DashboardCard ───────────────────────────────────────
function DashboardCard({ category, items, onAdd, onDelete, onEdit, forceOpen = false, query = '' }) {
  const [open, setOpen] = useState(true)
  const isOpen = forceOpen || open
  const [input, setInput] = useState('')
  const [details, setDetails] = useState('')
  const [links, setLinks] = useState([])
  const [recurrence, setRecurrence] = useState({ type: 'none' })
  const [formExpanded, setFormExpanded] = useState(false)
  const linkInputRef = useRef(null)

  const handleAdd = () => {
    const v = input.trim()
    if (!v) return
    const pendingLink = linkInputRef.current?.flush()
    const allLinks = pendingLink ? [...links, pendingLink] : links
    onAdd(category.id, v, details.trim(), allLinks, recurrence)
    setInput(''); setDetails(''); setLinks([]); setRecurrence({ type: 'none' }); setFormExpanded(false)
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
            {isOpen
              ? <ChevronUp   size={15} className="text-gray-500 flex-shrink-0" />
              : <ChevronDown size={15} className="text-gray-500 flex-shrink-0" />
            }
          </div>
        </button>

        {isOpen && (
          <div className="bg-white px-4 pt-3 pb-4 flex flex-col gap-2">

            {/* 業務名 */}
            <div className="flex gap-2">
              <input
                type="text" value={input}
                onChange={e => setInput(e.target.value)}
                onFocus={() => setFormExpanded(true)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="業務名を入力..."
                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#A0C8DC]/40 placeholder-gray-400"
              />
              <button onClick={handleAdd} disabled={!input.trim()} className="p-1.5 rounded-lg bg-gray-100 hover:bg-[#A0C8DC]/20 text-[#68B4C8] disabled:opacity-40 transition-colors flex-shrink-0">
                <Plus size={16} />
              </button>
            </div>

            {/* 業務詳細・リンク（フォーカス時展開） */}
            {formExpanded && (
              <div className="flex flex-col gap-2 animate-[fade-in_0.2s_ease-out] border border-gray-100 rounded-xl p-2.5 bg-gray-50/60">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">スケジュール</label>
                  <RecurrenceSelector value={recurrence} onChange={setRecurrence} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">業務詳細</label>
                  <textarea
                    value={details} onChange={e => setDetails(e.target.value)}
                    placeholder="詳細・メモ（任意）" rows={2}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#A0C8DC]/40 placeholder-gray-400 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">リンク</label>
                  {links.map(link => (
                    <div key={link.id} className="flex items-center gap-1.5 mb-1 px-2 py-1 bg-white rounded-lg border border-gray-100">
                      <LinkSvgIcon size={10} className="text-[#4AAEC0] flex-shrink-0" />
                      <span className="text-xs text-gray-600 flex-1 truncate">{link.title || link.url}</span>
                      <button type="button" onClick={() => setLinks(prev => prev.filter(l => l.id !== link.id))} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  <LinkInputRow ref={linkInputRef} onAdd={link => setLinks(prev => [...prev, link])} />
                </div>
                <div className="flex justify-end">
                  <button type="button"
                    onClick={() => { setFormExpanded(false); setDetails(''); setLinks([]); setRecurrence({ type: 'none' }) }}
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
                  <span className="text-sm text-gray-700 leading-snug"><Highlight text={item.text} query={query} /></span>
                  {getRecurrenceLabel(item.recurrence) && (
                    <p className="text-xs text-[#68B4C8] mt-0.5 font-medium">🔄 {getRecurrenceLabel(item.recurrence)}</p>
                  )}
                  {item.details && (
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug whitespace-pre-line">{item.details}</p>
                  )}
                  {item.links?.length > 0 && (
                    <div className="flex flex-col gap-0.5 mt-1">
                      {item.links.map(link => (
                        <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-[#C4855A] hover:underline w-fit">
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
                    className="p-1 text-gray-400 hover:text-[#68B4C8] rounded hover:bg-[#A0C8DC]/15 transition-colors"
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
function TaskRow({ task, onStatusChange, onDelete, onEdit, query = '' }) {
  const isDone = task.status === 'done'
  const links = task.links || []

  return (
    <div className="flex items-start gap-3 px-4 py-3.5 transition-all duration-200 hover:bg-[#FAF7F2]/70 group">
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* タイトル */}
        <span className="text-sm font-medium text-gray-800 leading-snug">
          <Highlight text={task.title} query={query} />
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
                className="inline-flex items-center gap-1.5 text-xs text-[#4AAEC0] hover:text-[#3A8AAE] hover:underline w-fit"
              >
                <LinkSvgIcon size={11} />
                {link.title || link.url}
              </a>
            ))}
          </div>
        )}

        {/* 進捗メモ（最新エントリのみ表示） */}
        {task.memo && (() => { const e = parseMemoEntries(task.memo)[0]; return e ? (
          <div className="mt-1 px-2.5 py-1.5 bg-[#FBF5E6] rounded-lg border-l-2 border-[#D4B86B] flex gap-2">
            {e.date && <span className="text-[#A0C8DC] text-xs font-medium flex-shrink-0">{e.date}</span>}
            <p className="text-xs text-gray-600 leading-relaxed truncate">{e.text}</p>
          </div>
        ) : null })()}
      </div>

      {/* 操作ボタン */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex-shrink-0">
        <button onClick={() => onEdit(task)} className="p-1.5 text-gray-400 hover:text-[#A0C8DC] rounded-lg hover:bg-[#A0C8DC]/10 transition-colors" title="編集">
          <Pencil size={13} />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-50 transition-colors" title="削除">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── TimeSelect（15分刻み）────────────────────────────────
const HOURS   = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 15, 30, 45]

function TimeSelect({ value, onChange }) {
  const [h, m] = value ? value.split(':').map(Number) : [null, null]
  const hasHour = h !== null && value !== ''

  const update = (newH, newM) => {
    if (newH === '' || newH === null) { onChange(''); return }
    const mm = newM !== null && newM !== undefined ? newM : 0
    onChange(`${String(newH).padStart(2,'0')}:${String(mm).padStart(2,'0')}`)
  }

  return (
    <div className="flex items-center gap-0.5">
      <select
        value={hasHour ? h : ''}
        onChange={e => update(e.target.value !== '' ? Number(e.target.value) : '', hasHour ? m : 0)}
        className="text-xs px-1 py-1 rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#A0C8DC]/40 text-gray-700"
      >
        <option value="">--</option>
        {HOURS.map(hh => <option key={hh} value={hh}>{String(hh).padStart(2,'0')}</option>)}
      </select>
      <span className="text-xs text-gray-400 px-0.5">:</span>
      <select
        value={hasHour ? (m ?? 0) : 0}
        onChange={e => update(h, Number(e.target.value))}
        disabled={!hasHour}
        className="text-xs px-1 py-1 rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#A0C8DC]/40 text-gray-700 disabled:opacity-40"
      >
        {MINUTES.map(mm => <option key={mm} value={mm}>{String(mm).padStart(2,'0')}</option>)}
      </select>
    </div>
  )
}

// ─── メモ履歴ヘルパー ──────────────────────────────────────
function parseMemoEntries(memo) {
  if (!memo) return []
  // 新形式: \n---\n 区切り
  if (memo.includes('\n---\n')) {
    return memo.split('\n---\n').filter(e => e.trim()).map(block => {
      const m = block.match(/^\[(\d{4}\/\d{2}\/\d{2})\] ([\s\S]+)/)
      return m ? { date: m[1], text: m[2] } : { date: null, text: block }
    })
  }
  // 旧形式の判定: 改行の直後に [date] が来るパターン
  if (/\n\[\d{4}\/\d{2}\/\d{2}\]/.test(memo)) {
    return memo.split('\n').filter(line => line.trim()).map(line => {
      const m = line.match(/^\[(\d{4}\/\d{2}\/\d{2})\] (.+)/)
      return m ? { date: m[1], text: m[2] } : { date: null, text: line }
    })
  }
  // 単一エントリ（改行含む可能性あり）
  const m = memo.match(/^\[(\d{4}\/\d{2}\/\d{2})\] ([\s\S]+)/)
  return [m ? { date: m[1], text: m[2] } : { date: null, text: memo }]
}

function buildMemoWithEntry(existing, newText) {
  if (!newText.trim()) return existing
  const d = new Date()
  const ds = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
  const entry = `[${ds}] ${newText.trim()}`
  return [entry, existing].filter(Boolean).join('\n---\n')
}

function removeMemoEntry(memo, index) {
  const entries = parseMemoEntries(memo)
  entries.splice(index, 1)
  return entries.map(e => e.date ? `[${e.date}] ${e.text}` : e.text).join('\n---\n')
}

// ─── RecurrenceSelector ───────────────────────────────────
function RecurrenceSelector({ value, onChange }) {
  const presets = useMemo(() => getRecurrencePresets(new Date()), [])
  const type = value?.type || 'none'

  const updateTime = (key, t) => onChange({ ...value, [key]: t })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map(opt => (
          <button key={opt.type} type="button"
            onClick={() => {
              if (opt.type === 'custom') {
                onChange({ type: 'custom', customDays: value?.customDays || [], startTime: value?.startTime || '', endTime: value?.endTime || '' })
              } else if (opt.type === 'monthly_last') {
                onChange({ type: 'monthly_last', weekday: value?.weekday ?? new Date().getDay(), startTime: value?.startTime || '', endTime: value?.endTime || '' })
              } else {
                onChange({ ...opt, startTime: value?.startTime || '', endTime: value?.endTime || '' })
              }
            }}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
              type === opt.type
                ? 'bg-[#A0C8DC] text-white border-[#68B4C8]'
                : 'bg-white text-gray-500 border-gray-200 hover:border-[#A0C8DC] hover:text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {type === 'monthly_last' && (
        <div className="flex gap-1.5 pt-1 flex-wrap">
          {WEEKDAY_NAMES.map((name, i) => (
            <button key={i} type="button"
              onClick={() => onChange({ ...value, weekday: i })}
              className={`w-8 h-8 text-xs rounded-full border font-medium transition-all ${
                value?.weekday === i
                  ? 'bg-[#A0C8DC] text-white border-[#68B4C8]'
                  : 'bg-white text-gray-400 border-gray-200 hover:border-[#A0C8DC]'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {type === 'custom' && (
        <div className="flex gap-1.5 pt-1 flex-wrap">
          {WEEKDAY_NAMES.map((name, i) => {
            const selected = value?.customDays?.includes(i)
            return (
              <button key={i} type="button"
                onClick={() => {
                  const days = selected
                    ? (value.customDays || []).filter(d => d !== i)
                    : [...(value.customDays || []), i]
                  onChange({ ...value, customDays: days })
                }}
                className={`w-8 h-8 text-xs rounded-full border font-medium transition-all ${
                  selected
                    ? 'bg-[#A0C8DC] text-white border-[#68B4C8]'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-[#A0C8DC]'
                }`}
              >
                {name}
              </button>
            )
          })}
        </div>
      )}

      {type !== 'none' && (
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <span className="text-xs text-gray-400">時間</span>
          <TimeSelect value={value?.startTime || ''} onChange={t => updateTime('startTime', t)} />
          <span className="text-xs text-gray-400">〜</span>
          <TimeSelect value={value?.endTime || ''} onChange={t => updateTime('endTime', t)} />
        </div>
      )}
    </div>
  )
}

// ─── 編集可能リンクリスト ─────────────────────────────────
function EditableLinkList({ links, onChange }) {
  const [editingId, setEditingId] = useState(null)
  const [editUrl, setEditUrl]     = useState('')
  const [editTitle, setEditTitle] = useState('')

  const startEdit = (link) => {
    setEditingId(link.id)
    setEditUrl(link.url)
    setEditTitle(link.title)
  }
  const saveEdit = (id) => {
    const u = editUrl.trim()
    if (!u) return
    onChange(links.map(l => l.id === id
      ? { ...l, url: normalizeUrl(u), title: editTitle.trim() || u }
      : l
    ))
    setEditingId(null)
  }
  const cancelEdit = () => setEditingId(null)
  const deleteLink = (id) => onChange(links.filter(l => l.id !== id))

  return (
    <div className="flex flex-col gap-1.5 mb-2">
      {links.map(link => (
        <div key={link.id}>
          {editingId === link.id ? (
            <div className="flex gap-1.5 items-center p-2 bg-[#EEF6FA] rounded-lg border border-[#A0C8DC]/30">
              <input
                value={editUrl} onChange={e => setEditUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit(link.id)}
                placeholder="URL"
                className="flex-1 text-xs px-2 py-1 rounded border border-[#A0C8DC]/30 bg-white focus:outline-none focus:ring-1 focus:ring-[#A0C8DC]/40 min-w-0"
              />
              <input
                value={editTitle} onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit(link.id)}
                placeholder="表示名"
                className="w-24 text-xs px-2 py-1 rounded border border-[#A0C8DC]/30 bg-white focus:outline-none focus:ring-1 focus:ring-[#A0C8DC]/40"
              />
              <button onClick={() => saveEdit(link.id)} className="p-1 text-[#4A9E68] hover:bg-[#EAF6EF] rounded transition-colors flex-shrink-0" title="保存">
                <Check size={13} />
              </button>
              <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors flex-shrink-0" title="キャンセル">
                <X size={13} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#F8F4F0] rounded-lg border border-[#A0C8DC]/15 group">
              <LinkSvgIcon size={12} className="text-[#4AAEC0] flex-shrink-0" />
              <a href={link.url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#4AAEC0] hover:underline flex-1 truncate">{link.title || link.url}</a>
              <button onClick={() => startEdit(link)}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-[#68B4C8] rounded hover:bg-[#A0C8DC]/15 transition-all flex-shrink-0" title="編集">
                <Pencil size={11} />
              </button>
              <button onClick={() => deleteLink(link.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 rounded hover:bg-red-50 transition-all flex-shrink-0" title="削除">
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── リンク入力行（フォーム/モーダル共通）────────────────
const LinkInputRow = forwardRef(function LinkInputRow({ onAdd }, ref) {
  const [url, setUrl]     = useState('')
  const [title, setTitle] = useState('')
  const urlRef   = useRef(url)
  const titleRef = useRef(title)
  urlRef.current   = url
  titleRef.current = title
  const handleAdd = () => {
    const u = url.trim()
    if (!u) return
    onAdd({ id: crypto.randomUUID(), url: normalizeUrl(u), title: title.trim() || u })
    setUrl(''); setTitle('')
  }
  // 未コミットのリンクを返す（保存ボタン押下時に呼び出す）
  useImperativeHandle(ref, () => ({
    flush: () => {
      const u = urlRef.current.trim()
      if (!u) return null
      const link = { id: crypto.randomUUID(), url: normalizeUrl(u), title: titleRef.current.trim() || u }
      setUrl(''); setTitle('')
      return link
    }
  }), [])
  return (
    <div className="flex gap-1.5 items-center">
      <input
        type="text" value={url} onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleAdd()}
        placeholder="URL"
        className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-[#A0C8DC]/20 bg-white/80 focus:outline-none focus:ring-1 focus:ring-[#A0C8DC]/40 placeholder-gray-400 min-w-0"
      />
      <input
        type="text" value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleAdd()}
        placeholder="表示名"
        className="w-24 text-xs px-2.5 py-1.5 rounded-lg border border-[#A0C8DC]/20 bg-white/80 focus:outline-none focus:ring-1 focus:ring-[#A0C8DC]/40 placeholder-gray-400"
      />
      <button type="button" onClick={handleAdd} className="p-1.5 rounded-lg bg-[#A0C8DC]/20 hover:bg-[#A0C8DC]/40 text-[#68B4C8] transition-colors flex-shrink-0">
        <Plus size={14} />
      </button>
    </div>
  )
})

// ─── DashboardItemEditModal ───────────────────────────────
function TimeInputModal({ item, onSave, onClose }) {
  const [time, setTime] = useState(item.time || '')
  useEscapeKey(onClose)
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl p-6 w-72 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-gray-700 truncate">🕐 {item.text}</h3>
        <input type="time" value={time} onChange={e => setTime(e.target.value)}
          className="w-full text-base px-4 py-2.5 rounded-xl border-2 border-[#A0C8DC]/30 focus:outline-none focus:ring-2 focus:ring-[#A0C8DC]/40 text-gray-700 text-center" />
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button onClick={() => { onSave(time); onClose() }}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-[#A0C8DC] text-white hover:bg-[#68B4C8] transition-colors active:scale-95">
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function DashboardItemEditModal({ item, onSave, onClose }) {
  const [title, setTitle]           = useState(item.text || '')
  const [details, setDetails]       = useState(item.details || '')
  const [memo, setMemo]             = useState(item.memo || '')
  const [newEntry, setNewEntry]     = useState('')
  const [links, setLinks]           = useState(item.links || [])
  const [recurrence, setRecurrence] = useState(item.recurrence || { type: 'none' })
  const linkInputRef = useRef(null)
  useEscapeKey(onClose)

  const handleSave = () => {
    if (!title.trim()) return
    const pendingLink = linkInputRef.current?.flush()
    const allLinks = pendingLink ? [...links, pendingLink] : links
    onSave({ title: title.trim(), details: details.trim(), memo: buildMemoWithEntry(memo, newEntry.trim()), links: allLinks, recurrence })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#A0C8DC]/20 w-full sm:max-w-lg max-h-[92vh] overflow-y-auto flex flex-col"
        style={{ background: 'linear-gradient(160deg, rgba(162,194,208,0.06) 0%, #ffffff 40%)' }}>

        <div className="sticky top-0 bg-white/95 backdrop-blur-sm flex items-center justify-between px-6 py-4 border-b border-[#F0EBE3] z-10">
          <h2 className="font-semibold text-gray-800 text-sm">編集</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5 flex-1">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">業務名</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full text-sm font-medium px-4 py-2.5 rounded-xl border-2 border-[#A0C8DC]/25 bg-white focus:outline-none focus:ring-2 focus:ring-[#A0C8DC]/40 focus:border-[#A0C8DC]/50 transition-all" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">スケジュール</label>
            <RecurrenceSelector value={recurrence} onChange={setRecurrence} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">業務詳細</label>
            <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} placeholder="業務の詳細（任意）"
              className="w-full text-sm px-4 py-2.5 rounded-xl border border-[#A0C8DC]/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#A0C8DC]/30 placeholder-gray-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">リンク</label>
            <EditableLinkList links={links} onChange={setLinks} />
            <LinkInputRow ref={linkInputRef} onAdd={link => setLinks(prev => [...prev, link])} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">進捗メモ</label>
            {parseMemoEntries(memo).length > 0 && (
              <div className="mb-2 max-h-36 overflow-y-auto flex flex-col gap-1.5">
                {parseMemoEntries(memo).map((entry, i) => (
                  <div key={i} className="text-xs bg-[#FAF7F2] rounded-xl px-3 py-2 flex gap-2 items-start group">
                    {entry.date && <span className="text-[#A0C8DC] font-medium flex-shrink-0">{entry.date}</span>}
                    <span className="text-gray-600 leading-relaxed flex-1 whitespace-pre-wrap">{entry.text}</span>
                    <button type="button" onClick={() => setMemo(removeMemoEntry(memo, i))} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0 ml-1 leading-none">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea value={newEntry} onChange={e => setNewEntry(e.target.value)} rows={2} placeholder="追記する..."
              className="w-full text-sm px-4 py-2.5 rounded-xl border border-[#A0C8DC]/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#A0C8DC]/30 placeholder-gray-400 resize-none" />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm px-6 py-4 border-t border-[#F0EBE3] flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={!title.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-[#A0C8DC] text-white hover:bg-[#68B4C8] disabled:opacity-40 transition-colors active:scale-95">
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ProcedureItemEditModal ───────────────────────────────
function ProcedureItemEditModal({ item, onSave, onClose }) {
  useEscapeKey(onClose)
  const [title, setTitle] = useState(item.title || '')
  const [url, setUrl]     = useState(item.url || '')
  const [note, setNote]   = useState(item.note || '')

  const handleSave = () => {
    if (!url.trim() && !title.trim()) return
    const cleanUrl = normalizeUrl(url)
    onSave({ title: title.trim(), url: cleanUrl, note: note.trim() })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#E8C8A0]/30 w-full sm:max-w-lg max-h-[85vh] overflow-y-auto flex flex-col"
        style={{ background: 'linear-gradient(160deg, rgba(232,200,160,0.06) 0%, #ffffff 40%)' }}>
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm flex items-center justify-between px-6 py-4 border-b border-[#F0EBE3] z-10">
          <h2 className="font-semibold text-gray-800 text-sm">編集</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 flex flex-col gap-5 flex-1">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">表示名</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full text-sm font-medium px-4 py-2.5 rounded-xl border-2 border-[#E8C8A0]/40 bg-white focus:outline-none focus:ring-2 focus:ring-[#E8C8A0]/40 transition-all" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">URL</label>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://"
              className="w-full text-sm px-4 py-2.5 rounded-xl border border-[#E8C8A0]/30 bg-white focus:outline-none focus:ring-2 focus:ring-[#E8C8A0]/30 placeholder-gray-400 transition-all" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">備考</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="メモ・説明（任意）"
              className="w-full text-sm px-4 py-2.5 rounded-xl border border-[#E8C8A0]/30 bg-white focus:outline-none focus:ring-2 focus:ring-[#E8C8A0]/30 placeholder-gray-400 resize-none" />
          </div>
        </div>
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm px-6 py-4 border-t border-[#F0EBE3] flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">キャンセル</button>
          <button onClick={handleSave} disabled={!url.trim() && !title.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-[#E8C8A0] text-[#6B4F2A] hover:bg-[#D4B086] disabled:opacity-40 transition-colors active:scale-95">
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ProcedureCategory ────────────────────────────────────
function ProcedureCategory({ category, onAddItem, onDeleteItem, onEditItem, onDelete, onRename, colorIndex, forceOpen = false, query = '' }) {
  const color   = PROC_COLORS[colorIndex % PROC_COLORS.length]
  const earPos  = PROC_EAR_POSITIONS[colorIndex % PROC_EAR_POSITIONS.length]
  const [open, setOpen]             = useState(true)
  const isOpen = forceOpen || open
  const [addExpanded, setAddExpanded] = useState(false)
  const [newTitle, setNewTitle]     = useState('')
  const [newUrl, setNewUrl]         = useState('')
  const [newNote, setNewNote]       = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput]   = useState(category.name)

  // カテゴリ名が外部で変わった時に追従
  useEffect(() => { setNameInput(category.name) }, [category.name])

  const handleAdd = () => {
    if (!newUrl.trim() && !newTitle.trim()) return
    const cleanUrl = normalizeUrl(newUrl)
    onAddItem(category.id, { title: newTitle.trim(), url: cleanUrl, note: newNote.trim() })
    setNewTitle(''); setNewUrl(''); setNewNote(''); setAddExpanded(false)
  }

  const commitRename = () => {
    const v = nameInput.trim()
    if (v) onRename(category.id, v)
    else setNameInput(category.name)
    setEditingName(false)
  }

  return (
    <div className="relative pt-9">
      <CatEarsDecor position={earPos} color={color} />
      <div className="rounded-3xl border-2 overflow-hidden" style={{ borderColor: color }}>
        {/* ヘッダー */}
        <div className="flex items-end justify-between px-4 pb-2 pt-2" style={{ backgroundColor: color, minHeight: 64 }}>
          {editingName ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input value={nameInput} onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditingName(false); setNameInput(category.name) } }}
                autoFocus
                className="flex-1 text-sm font-semibold px-2 py-1 rounded-lg bg-white/70 border border-white/80 focus:outline-none min-w-0" />
              <button onClick={commitRename} className="p-1 text-gray-600 hover:text-gray-800 flex-shrink-0"><Check size={13} /></button>
              <button onClick={() => { setEditingName(false); setNameInput(category.name) }} className="p-1 text-gray-500 flex-shrink-0"><X size={13} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm flex-1 min-w-0">
              <span className="text-base">📋</span>
              <span className="truncate">{category.name}</span>
              <span className="text-xs font-normal bg-white/70 px-2 py-0.5 rounded-full text-gray-500 flex-shrink-0">{category.items.length}件</span>
            </div>
          )}
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
            {!editingName && (
              <button onClick={() => setEditingName(true)} className="p-1.5 text-gray-600 hover:text-gray-800 rounded hover:bg-white/30 transition-colors" title="名前を編集">
                <Pencil size={11} />
              </button>
            )}
            <button onClick={() => onDelete(category.id)} className="p-1.5 text-gray-600 hover:text-red-600 rounded hover:bg-white/30 transition-colors" title="カテゴリを削除">
              <Trash2 size={11} />
            </button>
            <button onClick={() => setOpen(v => !v)} className="p-1.5 text-gray-600 rounded hover:bg-white/30 transition-colors">
              {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="bg-white px-4 pt-3 pb-4 flex flex-col gap-2">
            {category.items.length === 0 && !addExpanded && (
              <p className="text-xs text-gray-400 text-center py-1">リンクなし</p>
            )}
            {category.items.map(item => (
              <div key={item.id} className="flex items-start gap-2 bg-gray-50 hover:bg-[#FAF7F2] rounded-xl px-3 py-2.5 group transition-colors">
                <LinkSvgIcon size={12} className="text-[#B89060] mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-[#8B6A3E] hover:underline font-medium leading-snug">
                      <Highlight text={item.title || item.url} query={query} />
                    </a>
                  ) : (
                    <span className="text-sm text-gray-700 font-medium leading-snug"><Highlight text={item.title} query={query} /></span>
                  )}
                  {item.note && (
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug whitespace-pre-line">{item.note}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                  <button onClick={() => onEditItem(item, category.id)}
                    className="p-1 text-gray-400 hover:text-[#B89060] rounded hover:bg-[#E8C8A0]/20 transition-colors" title="編集">
                    <Pencil size={11} />
                  </button>
                  <button onClick={() => onDeleteItem(category.id, item.id)}
                    className="p-1 text-gray-400 hover:text-red-400 rounded hover:bg-red-50 transition-colors" title="削除">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}

            {/* 追加フォーム */}
            {addExpanded ? (
              <div className="flex flex-col gap-2 border border-gray-100 rounded-xl p-2.5 bg-gray-50/60 animate-[fade-in_0.2s_ease-out]">
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="表示名"
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#E8C8A0]/60 placeholder-gray-400" />
                <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="URL (https://...)"
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#E8C8A0]/60 placeholder-gray-400" />
                <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
                  placeholder="備考（任意）" rows={2}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#E8C8A0]/60 placeholder-gray-400 resize-none" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setAddExpanded(false); setNewTitle(''); setNewUrl(''); setNewNote('') }}
                    className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 transition-colors">キャンセル</button>
                  <button onClick={handleAdd} disabled={!newUrl.trim() && !newTitle.trim()}
                    className="text-xs text-gray-700 px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 transition-colors"
                    style={{ backgroundColor: color }}>
                    追加
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddExpanded(true)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#B89060] transition-colors py-0.5">
                <Plus size={13} />リンクを追加
              </button>
            )}
          </div>
        )}
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
  const linkInputRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    const v = title.trim()
    if (!v) return
    const pendingLink = linkInputRef.current?.flush()
    const allLinks = pendingLink ? [...links, pendingLink] : links
    onAdd({ title: v, details: details.trim(), memo: buildMemoWithEntry('', memo.trim()), status, dueDate, links: allLinks })
    setTitle(''); setDetails(''); setMemo(''); setStatus('doing')
    setDueDate(''); setLinks([]); setExpanded(false)
    suppressExpand.current = true
    inputRef.current?.focus()
    setTimeout(() => { suppressExpand.current = false }, 100)
  }

  return (
    <div className="relative pt-9">
      <CatEarsDecor position="top-center" color="#A8D8EC" />
      <div className="rounded-3xl border-2 border-[#A8D8EC] overflow-hidden">

        {/* ヘッダー */}
        <button onClick={() => { setOpen(v => !v); if (open) setExpanded(false) }} className="w-full">
          <div className="flex items-end justify-between px-4 pb-2 pt-2" style={{ backgroundColor: '#A8D8EC', minHeight: 64 }}>
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
                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#A0C8DC]/40 placeholder-gray-400"
              />
              <button type="submit" disabled={!title.trim()}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-[#A0C8DC]/20 text-[#68B4C8] disabled:opacity-40 transition-colors flex-shrink-0">
                <Plus size={16} />
              </button>
            </div>

            {expanded && (
              <div className="flex flex-col gap-2 mt-2 animate-[fade-in_0.2s_ease-out] border border-gray-100 rounded-xl p-2.5 bg-gray-50/60">
                {/* 詳細 */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">詳細</label>
                  <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="タスクの詳細（任意）" rows={2}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#A0C8DC]/40 placeholder-gray-400 resize-none" />
                </div>

                {/* 進捗メモ */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">進捗メモ</label>
                  <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="備考・進捗状況（任意）" rows={2}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#A0C8DC]/40 placeholder-gray-400 resize-none" />
                </div>

                {/* 関連リンク */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">関連リンク</label>
                  {links.map(link => (
                    <div key={link.id} className="flex items-center gap-1.5 mb-1 px-2 py-1 bg-white rounded-lg border border-gray-100">
                      <LinkSvgIcon size={10} className="text-[#4AAEC0] flex-shrink-0" />
                      <span className="text-xs text-gray-600 flex-1 truncate">{link.title || link.url}</span>
                      <button type="button" onClick={() => setLinks(prev => prev.filter(l => l.id !== link.id))} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  <LinkInputRow ref={linkInputRef} onAdd={link => setLinks(prev => [...prev, link])} />
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
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#A0C8DC]/40" />
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
  const [newEntry, setNewEntry] = useState('')
  const [status, setStatus]     = useState(task.status || 'doing')
  const [dueDate, setDueDate]   = useState(task.dueDate || '')
  const [links, setLinks]       = useState(task.links || [])
  const linkInputRef = useRef(null)
  useEscapeKey(onClose)

  const handleSave = () => {
    if (!title.trim()) return
    const pendingLink = linkInputRef.current?.flush()
    const allLinks = pendingLink ? [...links, pendingLink] : links
    onSave(task.id, { title: title.trim(), details: details.trim(), memo: buildMemoWithEntry(memo, newEntry.trim()), status, dueDate, links: allLinks })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* バックドロップ */}
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />

      {/* モーダルカード */}
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#A0C8DC]/20 w-full sm:max-w-lg max-h-[92vh] overflow-y-auto flex flex-col"
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
              className="w-full text-sm font-medium px-4 py-2.5 rounded-xl border-2 border-[#A0C8DC]/25 bg-white focus:outline-none focus:ring-2 focus:ring-[#A0C8DC]/40 focus:border-[#A0C8DC]/50 transition-all" />
          </div>

          {/* 詳細 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">詳細</label>
            <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} placeholder="タスクの詳細"
              className="w-full text-sm px-4 py-2.5 rounded-xl border border-[#A0C8DC]/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#A0C8DC]/30 placeholder-gray-400 resize-none" />
          </div>

          {/* 進捗メモ */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">進捗メモ</label>
            {parseMemoEntries(memo).length > 0 && (
              <div className="mb-2 max-h-40 overflow-y-auto flex flex-col gap-1.5">
                {parseMemoEntries(memo).map((entry, i) => (
                  <div key={i} className="text-xs bg-[#FAF7F2] rounded-xl px-3 py-2 flex gap-2 items-start group">
                    {entry.date && <span className="text-[#A0C8DC] font-medium flex-shrink-0">{entry.date}</span>}
                    <span className="text-gray-600 leading-relaxed flex-1 whitespace-pre-wrap">{entry.text}</span>
                    <button type="button" onClick={() => setMemo(removeMemoEntry(memo, i))} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0 ml-1 leading-none">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea value={newEntry} onChange={e => setNewEntry(e.target.value)} rows={2} placeholder="追記する..."
              className="w-full text-sm px-4 py-2.5 rounded-xl border border-[#A0C8DC]/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#A0C8DC]/30 placeholder-gray-400 resize-none" />
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
                className="text-xs px-3 py-1.5 rounded-lg border border-[#A0C8DC]/20 bg-white focus:outline-none focus:ring-1 focus:ring-[#A0C8DC]/40 w-full" />
            </div>
          </div>

          {/* 関連リンク */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">関連リンク</label>
            <EditableLinkList links={links} onChange={setLinks} />
            <LinkInputRow ref={linkInputRef} onAdd={link => setLinks(prev => [...prev, link])} />
          </div>
        </div>

        {/* フッターボタン */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm px-6 py-4 border-t border-[#F0EBE3] flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={!title.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-[#A0C8DC] text-white hover:bg-[#68B4C8] disabled:opacity-40 transition-colors active:scale-95">
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── SyncIndicator ────────────────────────────────────────
function SyncIndicator({ status, onConnect }) {
  const configs = {
    loading: { text: '読み込み中',       className: 'text-gray-400 bg-gray-50',        icon: <Cloud size={11} className="animate-pulse" /> },
    saving:  { text: '保存中',           className: 'text-[#68B4C8] bg-[#A0C8DC]/15',  icon: <Cloud size={11} /> },
    synced:  { text: '同期済み',         className: 'text-[#4A9E68] bg-[#EAF6EF]',     icon: <Cloud size={11} /> },
    error:   { text: 'オフライン',       className: 'text-[#E5807A] bg-[#FDF0EF]',     icon: <CloudOff size={11} /> },
    local:   { text: 'クラウドに接続',   className: 'text-[#68B4C8] bg-[#A0C8DC]/15 hover:bg-[#A0C8DC]/30 cursor-pointer', icon: <Cloud size={11} /> },
  }
  const cfg = configs[status] ?? configs.loading
  const isClickable = status === 'local' && onConnect
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-medium text-xs transition-colors ${cfg.className}`}
      onClick={isClickable ? onConnect : undefined}
      role={isClickable ? 'button' : undefined}
    >
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

// ─── ログイン画面 ─────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const btnRef = useRef(null)

  useEffect(() => {
    const init = () => {
      if (!window.google || !GIS_CLIENT_ID) return
      window.google.accounts.id.initialize({
        client_id: GIS_CLIENT_ID,
        callback: (res) => onLogin(res.credential),
      })
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: 'outline', size: 'large', text: 'signin_with', locale: 'ja',
      })
    }
    if (window.google) { init() } else { window.addEventListener('load', init) }
    return () => window.removeEventListener('load', init)
  }, [onLogin])

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center gap-8"
         style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
      <div className="flex flex-col items-center gap-3">
        <img src={catLogo} alt="Koto Note" className="w-16 h-16 object-contain" />
        <h1 className="font-bold text-gray-800 text-2xl tracking-wide">Koto Note</h1>
        <p className="text-sm text-gray-400">Googleアカウントでログインしてください</p>
      </div>
      <div ref={btnRef} />
      {!GIS_CLIENT_ID && <p className="text-xs text-red-400">GIS_CLIENT_ID が未設定です</p>}
    </div>
  )
}

// ─── Error Boundary ──────────────────────────────────────
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('App error:', error, info) }
  render() {
    if (this.state.hasError) return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-sm w-full text-center flex flex-col gap-4">
          <span className="text-4xl">🐱</span>
          <p className="text-gray-700 font-medium">エラーが発生しました</p>
          <p className="text-xs text-gray-400">ページをリロードしてください</p>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-xl bg-[#A0C8DC] text-white text-sm font-medium hover:bg-[#68B4C8] transition-colors">
            リロード
          </button>
        </div>
      </div>
    )
    return this.props.children
  }
}

// ─── メインアプリ ──────────────────────────────────────────
export default function App() {
  const [idToken, setIdToken]           = useState(() => sessionStorage.getItem('gis-id-token') ?? null)
  const [userEmail, setUserEmail]       = useState(() => sessionStorage.getItem('gis-user-email') ?? null)
  const [accessToken, setAccessToken]   = useState(() => sessionStorage.getItem('gis-access-token') ?? null)

  // 初期化時に1回だけキーを計算し、3つの state 初期値で共有
  // ページリロード時（sessionStorageにemailがある場合）もマイグレーションを実行する
  const _initialEmail = sessionStorage.getItem('gis-user-email')
  migrateStorageKeys(_initialEmail)
  const _initKeys = getStorageKeys(_initialEmail)
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(_initKeys.tasks)      ?? 'null') ?? []                                       } catch { return [] }
  })
  const [dashboard, setDashboard] = useState(() => {
    try { return JSON.parse(localStorage.getItem(_initKeys.dashboard)  ?? 'null') ?? { routine: [], adhoc: [], schedule: [] } } catch { return { routine: [], adhoc: [], schedule: [] } }
  })
  const [procedures, setProcedures] = useState(() => {
    try { return JSON.parse(localStorage.getItem(_initKeys.procedures) ?? 'null') ?? { categories: [] }                       } catch { return { categories: [] } }
  })
  const [activeTab, setActiveTab]         = useState('dashboard')

  const [searchQuery, setSearchQuery]     = useState('')
  const [showSearch, setShowSearch]       = useState(false)

  const [tasksOpen, setTasksOpen]         = useState(true)
  const [toast, setToast]                 = useState(null)
  const [filter, setFilter]               = useState('all')
  const [editingTask, setEditingTask]             = useState(null)
  const [editingDashItem, setEditingDashItem]     = useState(null) // { item, catId }
  const [timeItem, setTimeItem]                   = useState(null) // { item, catId }
  const [editingProcItem, setEditingProcItem]     = useState(null) // { item, catId }
  const [syncStatus, setSyncStatus]               = useState('loading')
  const [hasLoaded, setHasLoaded]                 = useState(false)
  const [showSettings, setShowSettings]           = useState(false)
  const [spreadsheetUrl, setSpreadsheetUrl]       = useState(() => localStorage.getItem(_initKeys.spreadsheetUrl) ?? null)
  const [editingSpreadsheetUrl, setEditingSpreadsheetUrl] = useState('')
  const syncTimerRef = useRef(null)
  const isSavingRef  = useRef(false)

  const handleLogin = useCallback((credential) => {
    try {
      const base64 = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(atob(base64))
      const email = payload.email
      migrateStorageKeys(email) // v1キー → v2キーへの自動マイグレーション
      const keys = getStorageKeys(email)
      let newTasks; try { newTasks = JSON.parse(localStorage.getItem(keys.tasks) ?? 'null') ?? [] } catch { newTasks = [] }
      let newDash; try { newDash = JSON.parse(localStorage.getItem(keys.dashboard) ?? 'null') ?? { routine: [], adhoc: [], schedule: [] } } catch { newDash = { routine: [], adhoc: [], schedule: [] } }
      let newProc; try { newProc = JSON.parse(localStorage.getItem(keys.procedures) ?? 'null') ?? { categories: [] } } catch { newProc = { categories: [] } }
      setTasks(newTasks)
      setDashboard(newDash)
      setProcedures(newProc)
      setHasLoaded(false)
      setIdToken(credential)
      setUserEmail(email)
      sessionStorage.setItem('gis-id-token', credential)
      sessionStorage.setItem('gis-user-email', email)
    } catch { console.error('IDトークンのデコードに失敗') }
  }, [])

  const handleLogout = useCallback(() => {
    if (window.google) window.google.accounts.id.disableAutoSelect()
    setIdToken(null)
    setUserEmail(null)
    setAccessToken(null)
    setHasLoaded(false)
    sessionStorage.removeItem('gis-id-token')
    sessionStorage.removeItem('gis-user-email')
    sessionStorage.removeItem('gis-access-token')
  }, [])

  // OAuth2 トークンクライアントを初期化し、サイレント取得を試みる
  const tokenClientRef = useRef(null)
  useEffect(() => {
    if (!userEmail || !GIS_CLIENT_ID) return
    const init = () => {
      if (!window.google?.accounts?.oauth2) return
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GIS_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly',
        callback: (res) => {
          if (res.access_token) {
            setAccessToken(res.access_token)
            sessionStorage.setItem('gis-access-token', res.access_token)
          }
        },
      })
      // 既に同意済みの場合はサイレント取得（初回はポップアップが必要なためボタンで対応）
      tokenClientRef.current.requestAccessToken({ prompt: '' })
    }
    if (window.google?.accounts?.oauth2) {
      init()
    } else if (document.readyState !== 'complete') {
      window.addEventListener('load', init)
    } else {
      // ページロード済みだが Google ライブラリ未到達 → 短いポーリングで再試行
      const timer = setInterval(() => { if (window.google?.accounts?.oauth2) { init(); clearInterval(timer) } }, 500)
      setTimeout(() => clearInterval(timer), 10000) // 10秒でタイムアウト
    }
    return () => window.removeEventListener('load', init)
  }, [userEmail])

  // ユーザー操作によるトークン取得（同意画面を表示）
  const handleConnectCloud = useCallback(() => {
    tokenClientRef.current?.requestAccessToken({ prompt: 'consent' })
  }, [])

  const storageKeys = useMemo(() => getStorageKeys(userEmail), [userEmail])

  useEffect(() => { localStorage.setItem(storageKeys.tasks, JSON.stringify(tasks)) }, [tasks, storageKeys])
  useEffect(() => { localStorage.setItem(storageKeys.dashboard, JSON.stringify(dashboard)) }, [dashboard, storageKeys])
  useEffect(() => { localStorage.setItem(storageKeys.procedures, JSON.stringify(procedures)) }, [procedures, storageKeys])

  // Google Sheets から初回読み込み
  useEffect(() => {
    const load = async () => {
      if (!userEmail || !accessToken) {
        setSyncStatus('local')
        setHasLoaded(true)
        return
      }
      try {
        const { ssId, driveApiDisabled } = await getOrCreateSpreadsheet(accessToken, storageKeys.ssId)
        if (driveApiDisabled) setToast(TOAST_MSGS.driveDisabled)
        const ssUrl = `https://docs.google.com/spreadsheets/d/${ssId}`
        setSpreadsheetUrl(ssUrl)
        localStorage.setItem(storageKeys.spreadsheetUrl, ssUrl)

        const data = await loadFromSheets(accessToken, ssId)
        // スプレッドシートが空（初回・移行直後）の場合はローカルデータを保持する
        const isEmpty = data.tasks.length === 0 &&
          Object.values(data.dashboard).every(arr => arr.length === 0)
        if (!isEmpty) {
          // タスク：シートにないローカルのタスクを保持 + updatedAtで新しい方を優先
          setTasks(prev => {
            const localMap = new Map(prev.map(t => [t.id, t]))
            const sheetIds = new Set(data.tasks.map(t => t.id))
            const localOnly = prev.filter(t => !sheetIds.has(t.id))
            const merged = data.tasks.map(sheetTask => {
              const local = localMap.get(sheetTask.id)
              if (!local) return sheetTask
              const sheetTime = sheetTask.updatedAt || sheetTask.createdAt || ''
              const localTime  = local.updatedAt  || local.createdAt  || ''
              return localTime > sheetTime ? local : sheetTask
            })
            return [...merged, ...localOnly]
          })
          // ダッシュボード
          setDashboard(prev => {
            const merged = {}
            const allCatIds = new Set([...Object.keys(data.dashboard), ...Object.keys(prev)])
            allCatIds.forEach(catId => {
              const sheetItems = data.dashboard[catId] || []
              const localItems = prev[catId] || []
              const sheetIds   = new Set(sheetItems.map(i => i.id))
              const localOnly  = localItems.filter(i => !sheetIds.has(i.id))
              merged[catId] = [
                ...sheetItems.map(sheetItem => {
                  const localItem = localItems.find(i => i.id === sheetItem.id)
                  if (!localItem) return sheetItem
                  if (localItem.recurrence?.type !== 'none' &&
                      (!sheetItem.recurrence || sheetItem.recurrence.type === 'none')) {
                    return { ...sheetItem, recurrence: localItem.recurrence }
                  }
                  return sheetItem
                }),
                ...localOnly,
              ]
            })
            return merged
          })
          // リンク
          setProcedures(prev => {
            const sheetCatIds = new Set((data.procedures.categories || []).map(c => c.id))
            const localOnly   = (prev.categories || []).filter(c => !sheetCatIds.has(c.id))
            return { categories: [...(data.procedures.categories || []), ...localOnly] }
          })
        }
        setSyncStatus('synced')
      } catch (err) {
        if (err.status === 401 || err.status === 403) {
          // トークンが無効またはスコープ不足 → クリアして再接続ボタンを表示
          setAccessToken(null)
          sessionStorage.removeItem('gis-access-token')
          setSyncStatus('local')
          setToast(TOAST_MSGS.reconnect)
        } else {
          setSyncStatus('error')
        }
      }
      setHasLoaded(true)
    }
    load()
  }, [accessToken, storageKeys])

  // データ変更時に Google Sheets へ同期（1.5秒デバウンス）
  useEffect(() => {
    if (!hasLoaded) return
    if (!userEmail || !accessToken) { setSyncStatus('local'); return }
    setSyncStatus('saving')
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      if (isSavingRef.current) return // 保存中の重複実行をスキップ
      const ssId = localStorage.getItem(storageKeys.ssId)
      if (!ssId) { return } // ロード完了後に再トリガーされるため、エラーにしない
      isSavingRef.current = true
      try {
        await saveToSheets(accessToken, ssId, { tasks, dashboard, procedures })
        setSyncStatus('synced')
      } catch {
        setSyncStatus('error')
      } finally {
        isSavingRef.current = false
      }
    }, 1500)
  }, [tasks, dashboard, procedures, hasLoaded, userEmail, accessToken, storageKeys])

  const addTask = (fields) => {
    const now = new Date().toISOString()
    setTasks(prev => [{
      id: crypto.randomUUID(),
      title: fields.title, details: fields.details || '', memo: fields.memo || '',
      status: fields.status, dueDate: fields.dueDate || '',
      links: fields.links || [],
      createdAt: now, updatedAt: now, completedAt: null,
    }, ...prev])
    setToast(TOAST_MSGS.add)
  }

  const editTask = (id, fields) => {
    setTasks(prev => prev.map(t => t.id !== id ? t : {
      ...t, ...fields,
      updatedAt: new Date().toISOString(),
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

  const deleteTask = (id) => setTasks(prev => prev.filter(t => t.id !== id))

  const addDashboardItem = (catId, text, details = '', links = [], recurrence = { type: 'none' }) =>
    setDashboard(prev => ({ ...prev, [catId]: [...(prev[catId] || []), { id: crypto.randomUUID(), text, details, memo: '', links, recurrence }] }))
  const deleteDashboardItem = (catId, itemId) =>
    setDashboard(prev => ({ ...prev, [catId]: (prev[catId] || []).filter(i => i.id !== itemId) }))
  const saveItemTime = (catId, itemId, time) => {
    setDashboard(prev => ({
      ...prev,
      [catId]: (prev[catId] || []).map(item =>
        item.id !== itemId ? item : { ...item, time }
      ),
    }))
  }

  const updateDashboardItem = (catId, itemId, fields) => {
    setDashboard(prev => ({
      ...prev,
      [catId]: (prev[catId] || []).map(item =>
        item.id !== itemId ? item : { ...item, text: fields.title, details: fields.details, memo: fields.memo, links: fields.links, recurrence: fields.recurrence, time: item.time }
      ),
    }))
    setToast(TOAST_MSGS.edit)
  }

  // ─── リンク CRUD ──────────────────────────────────────────
  const addProcCategory = () =>
    setProcedures(prev => ({ categories: [...prev.categories, { id: crypto.randomUUID(), name: '新しいカテゴリ', items: [] }] }))
  const deleteProcCategory = (catId) =>
    setProcedures(prev => ({ categories: prev.categories.filter(c => c.id !== catId) }))
  const renameProcCategory = (catId, name) =>
    setProcedures(prev => ({ categories: prev.categories.map(c => c.id !== catId ? c : { ...c, name }) }))
  const addProcItem = (catId, fields) =>
    setProcedures(prev => ({ categories: prev.categories.map(c => c.id !== catId ? c : { ...c, items: [...c.items, { id: crypto.randomUUID(), ...fields }] }) }))
  const deleteProcItem = (catId, itemId) =>
    setProcedures(prev => ({ categories: prev.categories.map(c => c.id !== catId ? c : { ...c, items: c.items.filter(i => i.id !== itemId) }) }))
  const updateProcItem = (catId, itemId, fields) => {
    setProcedures(prev => ({ categories: prev.categories.map(c => c.id !== catId ? c : { ...c, items: c.items.map(i => i.id !== itemId ? i : { ...i, ...fields }) }) }))
    setToast(TOAST_MSGS.edit)
  }

  const doneTasks      = useMemo(() => tasks.filter(t => t.status === 'done'), [tasks])
  const filteredActive = useMemo(() => {
    if (filter === 'all') return tasks.filter(t => t.status !== 'done')
    return tasks.filter(t => t.status === filter)
  }, [tasks, filter])

  const q = searchQuery.trim().toLowerCase()
  const searchedTasks = useMemo(() => {
    if (!q) return filteredActive
    return filteredActive.filter(t =>
      t.title.toLowerCase().includes(q) || (t.details || '').toLowerCase().includes(q)
    )
  }, [filteredActive, q])

  const searchedDashboard = useMemo(() => {
    if (!q) return dashboard
    const result = {}
    DASHBOARD_CATEGORIES.forEach(cat => {
      result[cat.id] = (dashboard[cat.id] || []).filter(item =>
        item.text.toLowerCase().includes(q) || (item.details || '').toLowerCase().includes(q)
      )
    })
    return result
  }, [dashboard, q])

  const searchedProcedures = useMemo(() => {
    if (!q) return procedures
    return {
      categories: procedures.categories
        .map(cat => ({
          ...cat,
          items: cat.items.filter(item =>
            (item.title || '').toLowerCase().includes(q) ||
            (item.url   || '').toLowerCase().includes(q) ||
            (item.note  || '').toLowerCase().includes(q)
          ),
        }))
        .filter(cat => cat.items.length > 0),
    }
  }, [procedures, q])

  const todayDone      = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear(), mo = now.getMonth(), d = now.getDate()
    return doneTasks.filter(t => {
      if (!t.completedAt) return false
      const dt = new Date(t.completedAt)
      return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d
    }).length
  }, [doneTasks])

  const todayDashItems = useMemo(() => {
    const today = new Date()
    const result = []
    DASHBOARD_CATEGORIES.forEach(cat => {
      ;(dashboard[cat.id] || []).forEach(item => {
        if (isItemToday(item.recurrence, today)) result.push({ ...item, cat })
      })
    })
    if (!q) return result
    return result.filter(item =>
      item.text.toLowerCase().includes(q) || (item.details || '').toLowerCase().includes(q)
    )
  }, [dashboard, q])

  if (!userEmail) return <LoginScreen onLogin={handleLogin} />

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-20" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>

      {/* ヘッダー */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md shadow-[0_2px_12px_rgba(162,194,208,0.18)]">
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between border-b border-[#A0C8DC]/15">
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
              <div className="flex items-center gap-1.5 bg-[#A0C8DC]/15 px-3 py-1.5 rounded-full text-[#68B4C8] font-medium">
                <Clock size={11} />進行中 {tasks.filter(t => t.status === 'doing').length}
              </div>
              <div className="flex items-center gap-1.5 bg-[#EAF6EF] px-3 py-1.5 rounded-full text-[#4A9E68] font-medium">
                <CheckCircle2 size={11} />今日 {todayDone}件完了
              </div>
            </div>
            <SyncIndicator status={syncStatus} onConnect={handleConnectCloud} />
            <button
              onClick={() => { setShowSearch(v => !v); if (showSearch) setSearchQuery('') }}
              className={`p-1.5 rounded-lg transition-colors ${showSearch ? 'bg-[#A0C8DC]/20 text-[#68B4C8]' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
              title="検索"
            >
              <Search size={15} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="設定"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>
        {/* 検索バー */}
        {showSearch && (
          <div className="max-w-4xl mx-auto px-6 py-2 border-b border-[#A0C8DC]/20 animate-[fade-in_0.15s_ease-out]">
            <div className="flex items-center gap-2 bg-[#FAF7F2] rounded-2xl px-3 py-2">
              <Search size={13} className="text-[#A0C8DC] flex-shrink-0" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="タスク・業務を検索..."
                className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-gray-300 hover:text-gray-500 transition-colors">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}
        {/* タブナビゲーション */}
        <div className="max-w-4xl mx-auto px-6 flex border-b border-[#A0C8DC]/25">
          <button onClick={() => setActiveTab('dashboard')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all flex items-center gap-1.5 ${
              activeTab === 'dashboard' ? 'border-[#9B80C8] text-[#9B80C8]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            <img src={catBlack} alt="" className="w-5 h-5 object-contain" />
            ダッシュボード
          </button>
          <button onClick={() => setActiveTab('tasks')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all flex items-center gap-1.5 ${
              activeTab === 'tasks' ? 'border-[#4AAAC5] text-[#4AAAC5]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            <img src={catLogo} alt="" className="w-5 h-5 object-contain" />
            タスク
          </button>
          <button onClick={() => setActiveTab('procedures')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all flex items-center gap-1.5 ${
              activeTab === 'procedures' ? 'border-[#C07090] text-[#C07090]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            <img src={catOrange} alt="" className="w-5 h-5 object-contain" />
            リンク
          </button>
        </div>
      </header>

      {/* リンクタブ */}
      {activeTab === 'procedures' && (
        <main className="max-w-4xl mx-auto px-6 py-7 flex flex-col gap-5">
          <section>
            <div className="flex justify-end mb-5">
              <button onClick={addProcCategory}
                className="flex items-center gap-1.5 text-xs text-[#C07090] hover:text-[#A05070] font-medium transition-colors">
                <Plus size={13} />カテゴリを追加
              </button>
            </div>
            <div className="flex flex-col gap-5 animate-[fade-in_0.3s_ease-out]">
              {procedures.categories.length === 0 ? (
                <div className="text-center py-14 flex flex-col items-center gap-3">
                  <p className="text-4xl">📋</p>
                  <p className="text-sm text-gray-400 font-medium">カテゴリを追加してリンクを整理しましょう</p>
                </div>
              ) : searchedProcedures.categories.length === 0 ? (
                <div className="text-center py-14 flex flex-col items-center gap-3">
                  <p className="text-4xl">🔍</p>
                  <p className="text-sm text-gray-400 font-medium">「{searchQuery}」に一致するリンクはありません</p>
                </div>
              ) : (
                searchedProcedures.categories.map((cat, i) => (
                  <ProcedureCategory key={cat.id} category={cat}
                    forceOpen={!!q} query={q}
                    onAddItem={addProcItem} onDeleteItem={deleteProcItem}
                    onEditItem={(item, catId) => setEditingProcItem({ item, catId })}
                    onDelete={deleteProcCategory} onRename={renameProcCategory}
                    colorIndex={i} />
                ))
              )}
            </div>
          </section>
        </main>
      )}

      {/* ダッシュボードタブ */}
      {activeTab === 'dashboard' && (
        <main className="max-w-4xl mx-auto px-6 py-7">
          {todayDashItems.length > 0 && (
            <div className="mb-5 animate-[fade-in_0.3s_ease-out]">
              {/* ヘッダー：ぽってり丸ラベル */}
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <span className="inline-flex items-center gap-1.5 bg-[#FFE8C8] text-[#C07040] text-xs font-bold px-3.5 py-1.5 rounded-full"
                      style={{ boxShadow: '0 1px 4px rgba(192,112,64,0.15)' }}>
                  ☀️ 今日の業務
                </span>
                <span className="text-xs text-gray-400">
                  {(() => { const t = new Date(); return `${t.getMonth()+1}月${t.getDate()}日（${WEEKDAY_NAMES[t.getDay()]}）` })()}
                </span>
              </div>
              {/* アイテム一覧 */}
              <div className="flex flex-col gap-2">
                {todayDashItems.map(({ cat, ...item }) => {
                  const cs = CHIIKAWA_CARD_STYLES[cat.id] || {}
                  return (
                  <div key={item.id}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-3xl transition-all"
                    style={{ background: cs.bg, boxShadow: cs.shadow, border: cs.border }}>
                    {/* 左：編集モーダルを開くエリア */}
                    <button onClick={() => setEditingDashItem({ item, catId: cat.id })}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[0.98] transition-transform">
                      <span className="w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0"
                            style={{ background: cs.iconBg }}>
                        <img src={catLogo} alt="" className="w-7 h-7 object-contain"
                             style={{ filter: cs.imgFilter }} />
                      </span>
                      <span className="text-sm text-gray-700 flex-1 truncate leading-snug"><Highlight text={item.text} query={q} /></span>
                    </button>
                    {/* 右：スケジュール＋時間ボタン */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {getRecurrenceLabel(item.recurrence) && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/90"
                              style={{ color: cs.chipColor }}>
                          {getRecurrenceLabel(item.recurrence)}
                        </span>
                      )}
                      <button onClick={() => setTimeItem({ item, catId: cat.id })}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white/90 transition-colors active:scale-[0.98]"
                        style={{ color: item.time ? '#555' : '#bbb' }}>
                        <Clock size={11} />
                        {item.time && <span>{item.time}</span>}
                      </button>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 animate-[fade-in_0.3s_ease-out]">
            {DASHBOARD_CATEGORIES.map(cat => {
              const catItems = searchedDashboard[cat.id] || []
              if (q && catItems.length === 0) return null
              return (
                <DashboardCard key={cat.id} category={cat} items={catItems}
                  forceOpen={!!q} query={q}
                  onAdd={addDashboardItem} onDelete={deleteDashboardItem}
                  onEdit={(item, catId) => setEditingDashItem({ item, catId })} />
              )
            })}
          </div>
        </main>
      )}

      {/* タスクタブ */}
      {activeTab === 'tasks' && <main className="max-w-4xl mx-auto px-6 py-7 flex flex-col gap-7">

        {/* タスク入力 */}
        <section><TaskInputForm onAdd={addTask} /></section>

        {/* アクティブタスク */}
        <section>
          <div className="relative pt-9">
            <CatEarsDecor position="top-left" color="#A8D8EC" />
            <div className="rounded-3xl border-2 border-[#A8D8EC] overflow-hidden">

              {/* ヘッダー */}
              <button onClick={() => setTasksOpen(v => !v)} className="w-full">
                <div className="flex items-end justify-between px-4 pb-2 pt-2" style={{ backgroundColor: '#A8D8EC', minHeight: 64 }}>
                  <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
                    ✔ タスク
                    <span className="text-xs font-normal bg-white/70 px-2 py-0.5 rounded-full text-gray-500">
                      {searchedTasks.length}件
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
                    {STATUS_ORDER.map(s => {
                      const cfg = STATUS_CONFIG[s]
                      const count = tasks.filter(t => t.status === s).length
                      return (
                        <button key={s} onClick={() => setFilter(s)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${filter === s ? `${cfg.color} border` : 'text-gray-400 hover:bg-gray-50'}`}>
                          {cfg.label}{count > 0 && ` ${count}`}
                        </button>
                      )
                    })}
                  </div>

                  {/* タスクリスト */}
                  {searchedTasks.length === 0 ? <EmptyState /> : (
                    <div className="flex flex-col divide-y divide-[#F5F0EB]">
                      {searchedTasks.map(task => (
                        <TaskRow key={task.id} task={task}
                          onStatusChange={changeStatus} onDelete={deleteTask}
                          onEdit={setEditingTask} query={q} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>


      </main>}

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

      {/* 時間設定モーダル */}
      {timeItem && (
        <TimeInputModal
          key={timeItem.item.id}
          item={timeItem.item}
          onSave={time => saveItemTime(timeItem.catId, timeItem.item.id, time)}
          onClose={() => setTimeItem(null)}
        />
      )}

      {/* リンクアイテム編集モーダル */}
      {editingProcItem && (
        <ProcedureItemEditModal
          item={editingProcItem.item}
          onSave={fields => updateProcItem(editingProcItem.catId, editingProcItem.item.id, fields)}
          onClose={() => setEditingProcItem(null)}
        />
      )}

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      {/* 設定モーダル */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             onClick={() => setShowSettings(false)}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-5"
               style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
               onClick={e => e.stopPropagation()}>

            {/* ヘッダー */}
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <Settings size={16} className="text-gray-400" />設定
              </h2>
              <button onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* ログイン中 */}
            <div className="bg-[#FAF7F2] rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">ログイン中</p>
              <p className="text-sm text-gray-700 font-medium truncate">{userEmail}</p>
            </div>

            {/* スプレッドシートを開く */}
            {(() => {
              const saveUrl = () => {
                const url = editingSpreadsheetUrl.trim()
                if (!url) return
                setSpreadsheetUrl(url)
                localStorage.setItem(storageKeys.spreadsheetUrl, url)
                setEditingSpreadsheetUrl('')
              }
              return (<>
                {spreadsheetUrl && !editingSpreadsheetUrl && (
                  <div className="flex items-center gap-2">
                    <a href={spreadsheetUrl} target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-between px-4 py-3 rounded-xl border border-[#A0C8DC]/40 hover:bg-[#A0C8DC]/10 transition-colors group">
                      <div className="flex items-center gap-2.5 text-sm text-gray-700">
                        <span className="text-base">📊</span>
                        スプレッドシートを開く
                      </div>
                      <ExternalLink size={13} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
                    </a>
                    <button onClick={() => setEditingSpreadsheetUrl(spreadsheetUrl)}
                      className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors">
                      <Pencil size={13} />
                    </button>
                  </div>
                )}
                {(!spreadsheetUrl || editingSpreadsheetUrl) && (
                  <div className="flex flex-col gap-2">
                    {!spreadsheetUrl && <p className="text-xs text-gray-400 px-1">スプレッドシートのURLを貼り付けてください（一度設定すれば次から不要）</p>}
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={editingSpreadsheetUrl}
                        onChange={e => setEditingSpreadsheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/..."
                        className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-[#A0C8DC] text-gray-700"
                      />
                      <button onClick={saveUrl} disabled={!editingSpreadsheetUrl.trim()}
                        className="px-3 py-2.5 rounded-xl bg-[#A0C8DC] hover:bg-[#80B0C8] text-white text-xs font-medium transition-colors disabled:opacity-40">
                        保存
                      </button>
                      {spreadsheetUrl && (
                        <button onClick={() => setEditingSpreadsheetUrl('')}
                          className="px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-400 text-xs transition-colors">
                          キャンセル
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>)
            })()}

            {/* ログアウト */}
            <button onClick={() => { setShowSettings(false); handleLogout() }}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-red-100 hover:bg-red-50 transition-colors text-sm text-red-500 hover:text-red-600 w-full">
              <LogOut size={14} />
              ログアウト
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
