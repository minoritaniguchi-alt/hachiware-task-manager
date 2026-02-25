const TASK_SHEET = 'タスク';
const DASH_SHEET = 'ダッシュボード';
const PROC_SHEET = '手順書';

const TASK_HEADERS = ['ID', 'タイトル', '詳細', '進捗メモ', 'ステータス', '期限', 'リンク', '作成日時', '完了日時'];
const DASH_HEADERS = ['ID', 'カテゴリ', '業務名', '詳細', '進捗メモ', 'リンク', 'スケジュール'];
const PROC_HEADERS = ['カテゴリID', 'カテゴリ名', 'アイテムID', '表示名', 'URL', '備考'];

/**
 * ログイン中のユーザーのスプレッドシートを取得または作成する。
 * UserProperties にスプレッドシートIDを保存するため、
 * GAS のデプロイ設定を「ユーザーとして実行：ウェブアプリにアクセスしているユーザー」
 * にする必要がある。
 */
function getUserSpreadsheet() {
  const props = PropertiesService.getUserProperties();
  const ssId = props.getProperty('spreadsheet_id');

  if (ssId) {
    try {
      return SpreadsheetApp.openById(ssId);
    } catch (e) {
      // スプレッドシートが削除されていた場合は再作成
    }
  }

  // マイドライブに新規作成
  const ss = SpreadsheetApp.create('タスク管理');

  // デフォルトで作成される「シート1」を削除
  const defaultSheet = ss.getSheets()[0];
  if (defaultSheet && defaultSheet.getName() !== TASK_SHEET) {
    // 先に必要なシートを作成してからデフォルトシートを削除
    initSheets(ss);
    ss.deleteSheet(defaultSheet);
  } else {
    initSheets(ss);
  }

  props.setProperty('spreadsheet_id', ss.getId());
  return ss;
}

/**
 * スプレッドシートに必要なシートを初期化する。
 */
function initSheets(ss) {
  ensureSheet(ss, TASK_SHEET, TASK_HEADERS);
  ensureSheet(ss, DASH_SHEET, DASH_HEADERS);
  ensureSheet(ss, PROC_SHEET, PROC_HEADERS);
}

function ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#d0e4f0');
  sheet.setFrozenRows(1);
  return sheet;
}

function getOrCreateSheet(ss, name, headers) {
  return ensureSheet(ss, name, headers);
}

function doGet(e) {
  const ss = getUserSpreadsheet();

  // タスク読み込み
  let tasks = [];
  const taskSheet = ss.getSheetByName(TASK_SHEET);
  if (taskSheet && taskSheet.getLastRow() > 1) {
    const rows = taskSheet.getRange(2, 1, taskSheet.getLastRow() - 1, TASK_HEADERS.length).getValues();
    tasks = rows
      .filter(row => row[0])
      .map(row => ({
        id: String(row[0]),
        title: row[1],
        details: row[2],
        memo: row[3],
        status: row[4],
        dueDate: row[5],
        links: row[6] ? JSON.parse(row[6]) : [],
        createdAt: row[7],
        completedAt: row[8] || null,
      }));
  }

  // ダッシュボード読み込み
  let dashboard = { routine: [], adhoc: [], schedule: [] };
  const dashSheet = ss.getSheetByName(DASH_SHEET);
  if (dashSheet && dashSheet.getLastRow() > 1) {
    const rows = dashSheet.getRange(2, 1, dashSheet.getLastRow() - 1, DASH_HEADERS.length).getValues();
    rows.filter(row => row[0]).forEach(row => {
      const catId = row[1];
      if (dashboard[catId]) {
        dashboard[catId].push({
          id: String(row[0]),
          text: row[2],
          details: row[3],
          memo: row[4],
          links: row[5] ? JSON.parse(row[5]) : [],
          recurrence: row[6] ? JSON.parse(row[6]) : { type: 'none' },
        });
      }
    });
  }

  // 手順書読み込み
  let procedures = { categories: [] };
  const procSheet = ss.getSheetByName(PROC_SHEET);
  if (procSheet && procSheet.getLastRow() > 1) {
    const rows = procSheet.getRange(2, 1, procSheet.getLastRow() - 1, PROC_HEADERS.length).getValues();
    const catMap = {};
    rows.filter(row => row[0]).forEach(row => {
      const catId = String(row[0]);
      if (!catMap[catId]) {
        catMap[catId] = { id: catId, name: row[1], items: [] };
      }
      if (row[2]) {
        catMap[catId].items.push({
          id: String(row[2]),
          title: row[3] || '',
          url: row[4] || '',
          note: row[5] || '',
        });
      }
    });
    procedures.categories = Object.values(catMap);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ tasks, dashboard, procedures, spreadsheetUrl: ss.getUrl() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ss = getUserSpreadsheet();

  // タスク書き込み
  const taskSheet = getOrCreateSheet(ss, TASK_SHEET, TASK_HEADERS);
  if (taskSheet.getLastRow() > 1) {
    taskSheet.getRange(2, 1, taskSheet.getLastRow() - 1, TASK_HEADERS.length).clearContent();
  }
  if (data.tasks && data.tasks.length > 0) {
    const rows = data.tasks.map(t => [
      t.id,
      t.title,
      t.details || '',
      t.memo || '',
      t.status,
      t.dueDate || '',
      t.links && t.links.length > 0 ? JSON.stringify(t.links) : '',
      t.createdAt || '',
      t.completedAt || '',
    ]);
    taskSheet.getRange(2, 1, rows.length, TASK_HEADERS.length).setValues(rows);
  }

  // ダッシュボード書き込み
  const dashSheet = getOrCreateSheet(ss, DASH_SHEET, DASH_HEADERS);
  if (dashSheet.getLastRow() > 1) {
    dashSheet.getRange(2, 1, dashSheet.getLastRow() - 1, DASH_HEADERS.length).clearContent();
  }
  if (data.dashboard) {
    const rows = [];
    Object.entries(data.dashboard).forEach(([catId, items]) => {
      items.forEach(item => {
        rows.push([
          item.id,
          catId,
          item.text,
          item.details || '',
          item.memo || '',
          item.links && item.links.length > 0 ? JSON.stringify(item.links) : '',
          item.recurrence && item.recurrence.type !== 'none' ? JSON.stringify(item.recurrence) : '',
        ]);
      });
    });
    if (rows.length > 0) {
      dashSheet.getRange(2, 1, rows.length, DASH_HEADERS.length).setValues(rows);
    }
  }

  // 手順書書き込み
  const procSheet = getOrCreateSheet(ss, PROC_SHEET, PROC_HEADERS);
  if (procSheet.getLastRow() > 1) {
    procSheet.getRange(2, 1, procSheet.getLastRow() - 1, PROC_HEADERS.length).clearContent();
  }
  if (data.procedures && data.procedures.categories) {
    const rows = [];
    data.procedures.categories.forEach(cat => {
      if (cat.items && cat.items.length > 0) {
        cat.items.forEach(item => {
          rows.push([cat.id, cat.name, item.id, item.title || '', item.url || '', item.note || '']);
        });
      } else {
        // アイテムなしのカテゴリも行を作成してカテゴリを保持
        rows.push([cat.id, cat.name, '', '', '', '']);
      }
    });
    if (rows.length > 0) {
      procSheet.getRange(2, 1, rows.length, PROC_HEADERS.length).setValues(rows);
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, spreadsheetUrl: ss.getUrl() }))
    .setMimeType(ContentService.MimeType.JSON);
}
