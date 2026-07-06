// Минимальный клиент Google Sheets API на сервис-аккаунте, без внешних
// зависимостей: сами подписываем JWT (RS256) и меняем его на access token
// (флоу jwt-bearer), дальше — обычные REST-запросы. Для dev-скриптов
// автоматизации таблицы (напр. проставить локальные пути фото в колонку images).
//
// Ключ сервис-аккаунта (JSON) — по пути из GOOGLE_APPLICATION_CREDENTIALS.
// Таблица должна быть расшарена его client_email с правом «Редактор».
import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

const b64url = (input) => Buffer.from(input).toString('base64url')

// Сервис-аккаунт JWT → access token.
export async function getAccessToken(keyPath) {
  const key = JSON.parse(readFileSync(keyPath, 'utf8'))
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: key.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  )
  const input = `${header}.${claim}`
  const sig = createSign('RSA-SHA256').update(input).sign(key.private_key, 'base64url')
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${input}.${sig}`,
    }),
  })
  if (!res.ok) throw new Error(`OAuth token: HTTP ${res.status} ${await res.text()}`)
  return (await res.json()).access_token
}

async function api(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Sheets API: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

// Название первой вкладки (когда имя вкладки не задано явно).
export async function firstTabTitle(spreadsheetId, token) {
  const meta = await api(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`, token)
  return meta.sheets?.[0]?.properties?.title
}

// Значения вкладки как массив строк (включая шапку).
export async function getValues(spreadsheetId, tab, token) {
  const range = encodeURIComponent(`${tab}!A1:ZZ`)
  const data = await api(`${SHEETS_API}/${spreadsheetId}/values/${range}`, token)
  return data.values || []
}

// Пакетная запись ячеек. updates = [{ range: "'Лист1'!C2", value: "..." }, …]
export async function batchUpdate(spreadsheetId, updates, token) {
  if (!updates.length) return { updated: 0 }
  const body = {
    valueInputOption: 'RAW',
    data: updates.map((u) => ({ range: u.range, values: [[u.value]] })),
  }
  const res = await api(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return { updated: res.totalUpdatedCells || 0 }
}

// Индекс столбца (0-based) → буква(ы) A1-нотации: 0→A, 25→Z, 26→AA.
export function columnLetter(index) {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
