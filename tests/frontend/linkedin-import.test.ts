import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { parseLinkedInExport } from '../../src/features/profiles/import/linkedin'

function exportedFile(name: string, bytes: Uint8Array | string): File {
  const content = typeof bytes === 'string' ? strToU8(bytes) : bytes
  return { name, size: content.byteLength, arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) } as File
}

function archive(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, strToU8(contents)])))
}

function centralDirectory(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return view.getUint32(i + 16, true)
  }
  throw new Error('missing central directory')
}

describe('LinkedIn local export import', () => {
  it('reads recognized ZIP data without mapping jobs or education into unrelated profile fields', async () => {
    const file = exportedFile('linkedin.zip', archive({
      'Basic_Profile.csv': 'Ignored,Header\nexample,value',
      'Profile.csv': '\uFEFFFirst Name,Last Name\r\nAna,Muñoz\r\n',
      'Positions.csv': 'Company Name,Title\nInstituto A,"Investigadora, senior"',
      'Education.csv': 'School Name,Degree Name\nUniversidad B,Doctorado',
      'Skills.csv': 'Name\nBioinformática\nEstadística',
    }))
    const result = await parseLinkedInExport(file)
    expect(result).toEqual({
      source: 'LinkedIn',
      fields: { full_name: 'Ana Muñoz', skills: 'Bioinformática, Estadística' },
      context: ['Experiencia: Investigadora, senior · Instituto A', 'Formación: Doctorado · Universidad B'],
      topicHints: [],
    })
    expect(result.fields).not.toHaveProperty('institution')
    expect(result.fields).not.toHaveProperty('bio')
  })

  it('accepts a partial standalone CSV and RFC 4180 quoted newlines', async () => {
    const result = await parseLinkedInExport(exportedFile('Positions.csv',
      'Company Name,Title\r\n"Instituto\nNacional","Investigación ""clínica"""\r\n'))
    expect(result.fields).toEqual({})
    expect(result.context).toEqual(['Experiencia: Investigación "clínica" · Instituto\nNacional'])
  })

  it('rejects malformed CSV and unsupported filenames', async () => {
    await expect(parseLinkedInExport(exportedFile('Profile.csv', 'First Name,Last Name\n"Ana,Mora'))).rejects.toThrow('entrecomillado')
    await expect(parseLinkedInExport(exportedFile('Profile.csv', 'First Name,Last Name\nAna'))).rejects.toThrow('distinta longitud')
    await expect(parseLinkedInExport(exportedFile('Contacts.csv', 'Name\nAna'))).rejects.toThrow('selecciona un ZIP')
    await expect(parseLinkedInExport(exportedFile('Profile.csv', 'Name\nAna'))).rejects.toThrow('First Name')
  })

  it('never proposes an empty skills value when the export contains no skill names', async () => {
    await expect(parseLinkedInExport(exportedFile('Skills.csv', 'Name,Other\n,foo'))).rejects.toThrow('no hay datos de perfil compatibles')
    const result = await parseLinkedInExport(exportedFile('data.zip', archive({
      'Profile.csv': 'First Name,Last Name\nAna,Mora',
      'Skills.csv': 'Name,Other\n,foo',
    })))
    expect(result.fields).toEqual({ full_name: 'Ana Mora' })
  })

  it('rejects traversals, duplicate recognized files, and inflated-size bombs before extraction', async () => {
    await expect(parseLinkedInExport(exportedFile('data.zip', archive({ '../Profile.csv': 'First Name,Last Name\nAna,Mora' })))).rejects.toThrow('ruta insegura')
    await expect(parseLinkedInExport(exportedFile('data.zip', archive({
      'Profile.csv': 'First Name,Last Name\nAna,Mora',
      'other/Profile.csv': 'First Name,Last Name\nEva,Soto',
    })))).rejects.toThrow('duplicados')
    const bomb = archive({ 'Profile.csv': 'First Name,Last Name\nAna,Mora' })
    const directory = centralDirectory(bomb)
    new DataView(bomb.buffer).setUint32(directory + 24, 10 * 1024 * 1024, true)
    await expect(parseLinkedInExport(exportedFile('data.zip', bomb))).rejects.toThrow('límites de expansión')
    const zip64 = archive({ 'Profile.csv': 'First Name,Last Name\nAna,Mora' })
    new DataView(zip64.buffer).setUint32(centralDirectory(zip64) + 20, 0xffffffff, true)
    await expect(parseLinkedInExport(exportedFile('data.zip', zip64))).rejects.toThrow('ZIP64')
    const forgedSize = archive({ 'Profile.csv': `First Name,Last Name\n${'A'.repeat(30_000)},Mora` })
    new DataView(forgedSize.buffer).setUint32(centralDirectory(forgedSize) + 24, 128, true)
    await expect(parseLinkedInExport(exportedFile('data.zip', forgedSize))).rejects.toThrow('límites de expansión')
  })

  it('rejects encrypted entries, corrupted payloads and oversized files', async () => {
    const encrypted = archive({ 'Profile.csv': 'First Name,Last Name\nAna,Mora' })
    const directory = centralDirectory(encrypted)
    const view = new DataView(encrypted.buffer)
    view.setUint16(directory + 8, view.getUint16(directory + 8, true) | 1, true)
    await expect(parseLinkedInExport(exportedFile('data.zip', encrypted))).rejects.toThrow('cifradas')
    const damaged = archive({ 'Profile.csv': 'First Name,Last Name\nAna,Mora' })
    const damagedDirectory = centralDirectory(damaged)
    new DataView(damaged.buffer).setUint32(damagedDirectory + 16, 0, true)
    await expect(parseLinkedInExport(exportedFile('data.zip', damaged))).rejects.toThrow('dañado')
    await expect(parseLinkedInExport({ name: 'data.zip', size: 5 * 1024 * 1024 + 1 } as File)).rejects.toThrow('hasta 5 MiB')
  })
})
