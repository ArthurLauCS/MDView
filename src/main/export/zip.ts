/**
 * A minimal ZIP writer.
 *
 * Hand-rolled rather than pulled from npm: the format is small, stable and
 * fully specified, and `node:zlib` already supplies the only hard part
 * (raw deflate). A dependency here would buy nothing but supply-chain surface
 * for a file this process writes once and never reads back.
 */
import { deflateRawSync } from 'node:zlib'

export interface ZipEntry {
  /** Forward-slash path inside the archive. Never absolute. */
  name: string
  data: Buffer
  /** Directory entries carry no bytes; they exist so empty folders survive. */
  directory?: boolean
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** MS-DOS date/time, which is what the archive header has always stored. */
function dosStamp(d: Date): { time: number; date: number } {
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

export function buildZip(entries: ZipEntry[], now = new Date()): Buffer {
  const { time, date } = dosStamp(now)
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8')
    const raw = entry.data
    const crc = crc32(raw)

    // Storing beats deflating when the file is already compressed or tiny:
    // deflate carries a per-stream header and can grow the payload.
    const deflated = deflateRawSync(raw, { level: 9 })
    const useDeflate = !entry.directory && deflated.length < raw.length
    const body = useDeflate ? deflated : raw
    const method = useDeflate ? 8 : 0

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    // Bit 11: entry names are UTF-8. Without it Chinese filenames mojibake
    // in tools that read the flag instead of guessing.
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28) // extra field length

    locals.push(local, nameBytes, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk number
    central.writeUInt16LE(0, 36) // internal attrs
    // External attrs: 040755 for a directory, 0100644 for a file. Unix hosts
    // read the high 16 bits, so an empty folder is not lost on extraction.
    central.writeUInt32LE(entry.directory ? 0x41ed0010 : 0x81a40000, 38)
    central.writeUInt32LE(offset, 42)

    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + body.length
  }

  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4) // this disk
  end.writeUInt16LE(0, 6) // disk with central directory
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...locals, centralBuf, end])
}
