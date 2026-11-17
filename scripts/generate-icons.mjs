// Gera os assets de identidade a partir da logo oficial (assets/brand/logo.webp),
// preservando as proporções do símbolo:
//   build/icon.ico  -> executável, instalador, desinstalador e atalhos
//   build/icon.png  -> ícone da janela
//   src/renderer/src/assets/logo.png -> logo exibida no painel
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'assets', 'brand', 'logo.webp')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** Logo quadrada com cantos arredondados (formato de ícone de aplicativo). */
async function rounded(size) {
  const radius = Math.round(size * 0.22)
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`
  )
  return sharp(source)
    .resize(size, size, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** Monta um .ico com entradas PNG (suportado desde o Windows Vista). */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + images.length * 16
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(entry)
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

mkdirSync(join(root, 'build'), { recursive: true })
mkdirSync(join(root, 'src', 'renderer', 'src', 'assets'), { recursive: true })

const images = []
for (const size of ICO_SIZES) images.push({ size, data: await rounded(size) })
writeFileSync(join(root, 'build', 'icon.ico'), buildIco(images))
writeFileSync(join(root, 'build', 'icon.png'), await rounded(512))
writeFileSync(join(root, 'src', 'renderer', 'src', 'assets', 'logo.png'), await rounded(192))
console.log('Ícones gerados: build/icon.ico, build/icon.png, src/renderer/src/assets/logo.png')
