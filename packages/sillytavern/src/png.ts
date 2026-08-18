import { TextDecoder } from 'node:util'
import { SillyTavernFormatError } from './errors.js'
import type { CharacterCardPngKeyword } from './types.js'

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
const MAX_PNG_BYTES = 64 * 1024 * 1024
const MAX_CHUNK_BYTES = 32 * 1024 * 1024

export interface ExtractedPngCharacterCard {
  keyword: CharacterCardPngKeyword
  rawJson: string
}

export function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value)
}

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (!hasPngSignature(bytes) || bytes.byteLength < PNG_SIGNATURE.byteLength + 25) {
    throw new SillyTavernFormatError('Invalid PNG header for dimensions.')
  }
  const length = readUint32(bytes, PNG_SIGNATURE.byteLength)
  const type = ascii(bytes.subarray(PNG_SIGNATURE.byteLength + 4, PNG_SIGNATURE.byteLength + 8))
  if (length !== 13 || type !== 'IHDR') throw new SillyTavernFormatError('PNG is missing a valid IHDR.')
  const width = readUint32(bytes, PNG_SIGNATURE.byteLength + 8)
  const height = readUint32(bytes, PNG_SIGNATURE.byteLength + 12)
  if (!width || !height) throw new SillyTavernFormatError('PNG dimensions must be positive.')
  return { width, height }
}

export function extractCharacterCardJsonFromPng(bytes: Uint8Array): ExtractedPngCharacterCard {
  if (bytes.byteLength > MAX_PNG_BYTES) {
    throw new SillyTavernFormatError(
      `PNG input is too large (${bytes.byteLength} bytes; maximum ${MAX_PNG_BYTES}).`
    )
  }
  if (bytes.byteLength < PNG_SIGNATURE.byteLength || !hasPngSignature(bytes)) {
    throw new SillyTavernFormatError('Invalid PNG signature; expected an 8-byte PNG signature.')
  }

  let offset = PNG_SIGNATURE.byteLength
  let chunkIndex = 0
  let sawHeader = false
  let sawEnd = false
  let ccv3: string | undefined
  let chara: string | undefined

  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 12) {
      throw new SillyTavernFormatError(`Truncated PNG chunk header at byte offset ${offset}.`)
    }

    const length = readUint32(bytes, offset)
    if (length > MAX_CHUNK_BYTES) {
      throw new SillyTavernFormatError(
        `PNG chunk at byte offset ${offset} declares ${length} bytes; maximum is ${MAX_CHUNK_BYTES}.`
      )
    }
    const type = ascii(bytes.subarray(offset + 4, offset + 8))
    if (!/^[A-Za-z]{4}$/.test(type)) {
      throw new SillyTavernFormatError(`Invalid PNG chunk type at byte offset ${offset}.`)
    }
    const dataStart = offset + 8
    const availableAfterHeader = bytes.byteLength - dataStart
    if (length > availableAfterHeader - 4) {
      throw new SillyTavernFormatError(`PNG chunk ${type} at byte offset ${offset} exceeds the input bounds.`)
    }
    const dataEnd = dataStart + length
    const chunkEnd = dataEnd + 4
    const data = bytes.subarray(dataStart, dataEnd)

    if (chunkIndex === 0) {
      if (type !== 'IHDR' || length !== 13) {
        throw new SillyTavernFormatError('PNG must begin with a 13-byte IHDR chunk.')
      }
      sawHeader = true
    } else if (type === 'IHDR') {
      throw new SillyTavernFormatError('PNG contains more than one IHDR chunk.')
    }

    if (type === 'tEXt') {
      const nul = data.indexOf(0)
      if (nul <= 0 || nul > 79) {
        throw new SillyTavernFormatError(
          `Invalid PNG tEXt chunk at byte offset ${offset}; keyword must be 1-79 bytes.`
        )
      }
      const keyword = ascii(data.subarray(0, nul))
      const value = ascii(data.subarray(nul + 1))
      if (keyword === 'ccv3' && ccv3 === undefined) ccv3 = value
      if (keyword === 'chara' && chara === undefined) chara = value
    }

    offset = chunkEnd
    chunkIndex += 1
    if (type === 'IEND') {
      if (length !== 0) throw new SillyTavernFormatError('PNG IEND chunk must have zero data bytes.')
      sawEnd = true
      if (offset !== bytes.byteLength) {
        throw new SillyTavernFormatError('PNG contains trailing bytes after the IEND chunk.')
      }
      break
    }
  }

  if (!sawHeader) throw new SillyTavernFormatError('PNG is missing its IHDR chunk.')
  if (!sawEnd) throw new SillyTavernFormatError('PNG is missing its IEND chunk.')

  const selected = ccv3 !== undefined ? { keyword: 'ccv3' as const, value: ccv3 } : undefined
  const compatible = chara !== undefined ? { keyword: 'chara' as const, value: chara } : undefined
  const payload = selected ?? compatible
  if (!payload) {
    throw new SillyTavernFormatError('PNG has no SillyTavern tEXt chunk named "ccv3" or "chara".')
  }

  return {
    keyword: payload.keyword,
    rawJson: decodeCardBase64(payload.value, payload.keyword)
  }
}

/** Embed a canonical base64 Character Card payload before IEND, replacing stale card chunks. */
export function embedCharacterCardJsonInPng(
  bytes: Uint8Array,
  rawJson: string,
  keyword: CharacterCardPngKeyword = 'ccv3'
): Buffer {
  if (!hasPngSignature(bytes)) throw new SillyTavernFormatError('Invalid PNG signature.')
  const chunks: Buffer[] = [Buffer.from(PNG_SIGNATURE)]
  let offset = PNG_SIGNATURE.byteLength
  let sawHeader = false
  let sawEnd = false
  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 12) {
      throw new SillyTavernFormatError(`Truncated PNG chunk header at byte offset ${offset}.`)
    }
    const length = readUint32(bytes, offset)
    const end = offset + 12 + length
    if (length > MAX_CHUNK_BYTES || end > bytes.byteLength) {
      throw new SillyTavernFormatError(`PNG chunk at byte offset ${offset} exceeds the input bounds.`)
    }
    const type = ascii(bytes.subarray(offset + 4, offset + 8))
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) {
        throw new SillyTavernFormatError('PNG must begin with a 13-byte IHDR chunk.')
      }
      sawHeader = true
    }
    let staleCardText = false
    if (type === 'tEXt') {
      const nul = data.indexOf(0)
      const existingKeyword = nul > 0 ? ascii(data.subarray(0, nul)) : ''
      staleCardText = existingKeyword === 'ccv3' || existingKeyword === 'chara'
    }
    if (type === 'IEND') {
      const payload = Buffer.from(rawJson, 'utf8').toString('base64')
      chunks.push(pngChunk('tEXt', Buffer.from(`${keyword}\0${payload}`, 'latin1')))
      chunks.push(Buffer.from(bytes.subarray(offset, end)))
      sawEnd = true
      offset = end
      break
    }
    if (!staleCardText) chunks.push(Buffer.from(bytes.subarray(offset, end)))
    offset = end
  }
  if (!sawHeader || !sawEnd || offset !== bytes.byteLength) {
    throw new SillyTavernFormatError('PNG is incomplete or contains trailing bytes.')
  }
  const output = Buffer.concat(chunks)
  if (output.byteLength > MAX_PNG_BYTES) {
    throw new SillyTavernFormatError(`Embedded PNG exceeds ${MAX_PNG_BYTES} bytes.`)
  }
  return output
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const output = Buffer.alloc(12 + data.byteLength)
  output.writeUInt32BE(data.byteLength, 0)
  typeBytes.copy(output, 4)
  Buffer.from(data).copy(output, 8)
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), 8 + data.byteLength)
  return output
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function decodeCardBase64(value: string, keyword: CharacterCardPngKeyword): string {
  if (!value || value !== value.trim()) {
    throw new SillyTavernFormatError(`PNG ${keyword} payload is not valid base64.`)
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new SillyTavernFormatError(`PNG ${keyword} payload is not valid base64.`)
  }
  const firstPadding = value.indexOf('=')
  if (firstPadding !== -1 && (value.length % 4 !== 0 || firstPadding < value.length - 2)) {
    throw new SillyTavernFormatError(`PNG ${keyword} payload has invalid base64 padding.`)
  }

  const decoded = Buffer.from(value, 'base64')
  const canonical = decoded.toString('base64').replace(/=+$/, '')
  if (!decoded.byteLength || canonical !== value.replace(/=+$/, '')) {
    throw new SillyTavernFormatError(`PNG ${keyword} payload is not valid base64.`)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(decoded)
  } catch (cause) {
    throw new SillyTavernFormatError(`PNG ${keyword} payload is not valid UTF-8 JSON text.`, {
      cause
    })
  }
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false)
}

function ascii(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')
}
