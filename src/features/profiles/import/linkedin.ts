import { Inflate } from 'fflate'

export interface LinkedInProfileImport {
  source: 'LinkedIn'
  fields: Partial<Record<'full_name' | 'institution' | 'country' | 'bio' | 'orcid_id' | 'skills', string>>
  context: string[]
  topicHints: string[]
}

type ExportKind = 'Profile' | 'Positions' | 'Education' | 'Skills'
type ExportRows = { headers: string[]; rows: Record<string, string>[] }

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ENTRIES = 100
const MAX_ENTRY_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 20 * 1024 * 1024
const MAX_RATIO = 100
const MAX_ROWS = 1000
const MAX_COLUMNS = 100
const decoder = new TextDecoder('utf-8', { fatal: true })

function fail(reason: string): never {
  throw new Error(`No se pudo importar el archivo de LinkedIn: ${reason}`)
}

function exportKind(name: string): ExportKind | null {
  const basename = name.split('/').at(-1)?.toLowerCase()
  switch (basename) {
    case 'profile.csv': return 'Profile'
    case 'positions.csv': return 'Positions'
    case 'education.csv': return 'Education'
    case 'skills.csv': return 'Skills'
    default: return null
  }
}

function safeZipPath(name: string): void {
  const parts = (name.endsWith('/') ? name.slice(0, -1) : name).split('/')
  if (name.startsWith('/') || name.includes('\\') || name.includes(':') ||
      [...name].some((character) => character.charCodeAt(0) < 32) ||
      parts.some((part) => !part || part === '.' || part === '..')) fail('el ZIP contiene una ruta insegura')
}

function parseCsv(bytes: Uint8Array): ExportRows {
  if (bytes.byteLength > MAX_ENTRY_BYTES) fail('un CSV supera el tamaño admitido')
  let input: string
  try {
    input = decoder.decode(bytes).replace(/^\uFEFF/, '')
  } catch {
    fail('el CSV no está codificado en UTF-8')
  }
  if (input.includes('\0')) fail('el CSV contiene caracteres inválidos')

  const lines: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let closedQuote = false
  for (let i = 0; i < input.length; i++) {
    const character = input[i]
    if (quoted) {
      if (character === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++ } else { quoted = false; closedQuote = true }
      } else {
        cell += character
      }
    } else if (character === ',' || character === '\n' || character === '\r') {
      row.push(cell.trim())
      if (row.length > MAX_COLUMNS) fail('el CSV tiene demasiadas columnas')
      cell = ''
      closedQuote = false
      if (character !== ',') {
        if (character === '\r' && input[i + 1] === '\n') i++
        if (row.some((value) => value !== '')) lines.push(row)
        if (lines.length > MAX_ROWS + 1) fail('el CSV tiene demasiadas filas')
        row = []
      }
    } else if (character === '"' && !cell && !closedQuote) {
      quoted = true
    } else if (character === '"' || closedQuote) {
      fail('el CSV tiene comillas mal formadas')
    } else {
      cell += character
    }
    if (cell.length > 3000) fail('el CSV contiene un campo demasiado largo')
  }
  if (quoted) fail('el CSV termina dentro de un campo entrecomillado')
  if (row.length || cell) {
    row.push(cell.trim())
    if (row.some((value) => value !== '')) lines.push(row)
  }
  const [headers, ...body] = lines
  if (!headers?.length || !body.length || headers.some((header) => !header) ||
      new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
    fail('el CSV no tiene una cabecera única y al menos una fila')
  }
  if (body.some((item) => item.length !== headers.length)) fail('el CSV tiene filas de distinta longitud')
  return { headers, rows: body.map((item) => Object.fromEntries(headers.map((header, index) => [header, item[index]]))) }
}

function hasHeaders(table: ExportRows, ...names: string[]): boolean {
  return names.every((name) => table.headers.includes(name))
}

type ZipEntry = {
  kind: ExportKind
  crc: number
  method: number
  compressed: number
  original: number
  dataOffset: number
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function inspectZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (at: number) => view.getUint16(at, true)
  const u32 = (at: number) => view.getUint32(at, true)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === bytes.length) { end = i; break }
  }
  if (end < 0 || u16(end + 4) !== 0 || u16(end + 6) !== 0 || u16(end + 8) !== u16(end + 10)) {
    fail('el ZIP está mal formado o usa varios discos')
  }
  const count = u16(end + 10)
  const directoryBytes = u32(end + 12)
  const directoryOffset = u32(end + 16)
  if (!count || count > MAX_ENTRIES || count === 0xffff || directoryBytes === 0xffffffff || directoryOffset === 0xffffffff ||
      directoryOffset + directoryBytes > end) fail('el ZIP tiene demasiadas entradas o un directorio inválido')
  let cursor = directoryOffset
  let totalBytes = 0
  const entries: ZipEntry[] = []
  const names = new Set<string>()
  const kinds = new Set<ExportKind>()
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) fail('el directorio del ZIP está mal formado')
    const flags = u16(cursor + 8)
    const method = u16(cursor + 10)
    const crc = u32(cursor + 16)
    const compressed = u32(cursor + 20)
    const original = u32(cursor + 24)
    const nameLength = u16(cursor + 28)
    const extraLength = u16(cursor + 30)
    const commentLength = u16(cursor + 32)
    const externalAttributes = u32(cursor + 38)
    const localOffset = u32(cursor + 42)
    const next = cursor + 46 + nameLength + extraLength + commentLength
    if (next > directoryOffset + directoryBytes || !nameLength || flags & 0x41 ||
        compressed === 0xffffffff || original === 0xffffffff || localOffset === 0xffffffff) {
      fail('el ZIP contiene entradas cifradas, ZIP64 o inválidas')
    }
    let name: string
    try {
      name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    } catch {
      fail('el ZIP contiene un nombre que no es UTF-8')
    }
    safeZipPath(name)
    if (((externalAttributes >>> 16) & 0xf000) === 0xa000) fail('el ZIP contiene enlaces simbólicos')
    const folded = name.toLowerCase()
    if (names.has(folded)) fail('el ZIP contiene nombres duplicados')
    names.add(folded)
    if (original > MAX_ENTRY_BYTES || (original && (!compressed || original / compressed > MAX_RATIO))) {
      fail('el ZIP excede los límites de expansión')
    }
    totalBytes += original
    if (totalBytes > MAX_TOTAL_BYTES) fail('el ZIP excede el tamaño total admitido')
    if (localOffset + 30 > directoryOffset || u32(localOffset) !== 0x04034b50 ||
        u16(localOffset + 6) !== flags || u16(localOffset + 8) !== method) {
      fail('la entrada local del ZIP está mal formada')
    }
    const localNameLength = u16(localOffset + 26)
    const localExtraLength = u16(localOffset + 28)
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength
    if (dataOffset + compressed > directoryOffset || localNameLength !== nameLength ||
        !bytes.subarray(0, nameLength).every((_, position) => bytes[localOffset + 30 + position] === bytes[cursor + 46 + position])) {
      fail('la entrada local del ZIP no coincide con el directorio')
    }
    const kind = name.endsWith('/') ? null : exportKind(name)
    if (kind) {
      if (method !== 0 && method !== 8) fail('el ZIP usa una compresión no admitida')
      if (kinds.has(kind)) fail('el ZIP contiene CSV de perfil duplicados')
      kinds.add(kind)
      entries.push({ kind, crc, method, compressed, original, dataOffset })
    }
    cursor = next
  }
  if (cursor !== directoryOffset + directoryBytes || !entries.length) fail('el ZIP no contiene CSV reconocidos de LinkedIn')
  return entries
}

function extractTables(bytes: Uint8Array): Map<ExportKind, ExportRows> {
  const entries = inspectZip(bytes)
  const tables = new Map<ExportKind, ExportRows>()
  for (const entry of entries) {
    let content: Uint8Array
    if (entry.method === 0) {
      content = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressed)
    } else {
      const output = new Uint8Array(entry.original)
      let written = 0
      const inflater = new Inflate((chunk) => {
        if (written + chunk.length > entry.original) fail('el ZIP excede los límites de expansión')
        output.set(chunk, written)
        written += chunk.length
      })
      try {
        for (let offset = 0; offset < entry.compressed; offset += 4096) {
          const end = Math.min(offset + 4096, entry.compressed)
          inflater.push(bytes.subarray(entry.dataOffset + offset, entry.dataOffset + end), end === entry.compressed)
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('límites de expansión')) throw error
        fail('el ZIP está dañado o no se pudo descomprimir')
      }
      content = output.subarray(0, written)
    }
    if (content.length !== entry.original || crc32(content) !== entry.crc) fail('un CSV del ZIP está dañado')
    tables.set(entry.kind!, parseCsv(content))
  }
  return tables
}

function normalize(tables: Map<ExportKind, ExportRows>): LinkedInProfileImport {
  const result: LinkedInProfileImport = { source: 'LinkedIn', fields: {}, context: [], topicHints: [] }
  const profile = tables.get('Profile')
  if (profile) {
    if (!hasHeaders(profile, 'First Name', 'Last Name')) fail('Profile.csv no tiene las columnas First Name y Last Name')
    if (profile.rows.length !== 1) fail('Profile.csv debe contener exactamente una persona')
    const name = [profile.rows[0]['First Name'], profile.rows[0]['Last Name']].filter(Boolean).join(' ').trim()
    if (name && name.length <= 150) result.fields.full_name = name
  }
  const positions = tables.get('Positions')
  if (positions) {
    if (!positions.headers.some((header) => header === 'Company Name' || header === 'Title')) {
      fail('Positions.csv no tiene columnas reconocidas')
    }
    for (const row of positions.rows.slice(0, 10)) {
      const text = [row.Title, row['Company Name']].filter(Boolean).join(' · ')
      if (text) result.context.push(`Experiencia: ${text}`)
    }
  }
  const education = tables.get('Education')
  if (education) {
    if (!education.headers.some((header) => header === 'School Name' || header === 'Degree Name')) {
      fail('Education.csv no tiene columnas reconocidas')
    }
    for (const row of education.rows.slice(0, 10)) {
      const text = [row['Degree Name'], row['School Name']].filter(Boolean).join(' · ')
      if (text) result.context.push(`Formación: ${text}`)
    }
  }
  const skills = tables.get('Skills')
  if (skills) {
    const column = skills.headers.includes('Name') ? 'Name' : skills.headers.includes('Skill') ? 'Skill' : null
    if (!column) fail('Skills.csv no tiene la columna Name o Skill')
    const names = [...new Set(skills.rows.map((row) => row[column].trim()).filter(Boolean))]
    if (names.length > 0 && names.length <= 50 && names.join(', ').length <= 2000) {
      result.fields.skills = names.join(', ')
    } else if (names.length > 0) {
      result.context.push('Las competencias exceden el límite del perfil; revísalas manualmente.')
    }
  }
  if (!Object.keys(result.fields).length && !result.context.length) fail('no hay datos de perfil compatibles en los CSV')
  return result
}

/** Reads only the user's local export. Neither the original file nor its bytes are persisted or uploaded. */
export async function parseLinkedInExport(file: File): Promise<LinkedInProfileImport> {
  if (!file.size || file.size > MAX_FILE_BYTES) fail('selecciona un archivo de hasta 5 MiB')
  const isZip = /\.zip$/i.test(file.name)
  const kind = exportKind(file.name)
  if (!isZip && !kind) fail('selecciona un ZIP de LinkedIn o Profile, Positions, Education o Skills.csv')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (isZip) return normalize(extractTables(bytes))
  return normalize(new Map([[kind!, parseCsv(bytes)]]))
}
