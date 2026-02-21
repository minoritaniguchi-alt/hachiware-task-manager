const TASK_SHEET = 'タスク';
const DASH_SHEET = 'ダッシュボード';

const TASK_HEADERS = ['ID', 'タイトル', '詳細', '進捗メモ', 'ステータス', '期限', 'リンク', '作成日時', '完了日時'];
const DASH_HEADERS = ['ID', 'カテゴリ', '業務名', '詳細', '進捗メモ', 'リンク', 'スケジュール'];

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  // ヘッダー行を常に確認・設定
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#d0e4f0');
  sheet.setFrozenRows(1);
  return sheet;
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

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

  return ContentService
    .createTextOutput(JSON.stringify({ tasks, dashboard }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // タスク書き込み
  const taskSheet = getOrCreateSheet(TASK_SHEET, TASK_HEADERS);
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
  const dashSheet = getOrCreateSheet(DASH_SHEET, DASH_HEADERS);
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

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
