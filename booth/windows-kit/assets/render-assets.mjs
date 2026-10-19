// Renders wallpaper.png, start.ico and decision.ico from the HTML next to this file.
// Run from a checkout after pnpm install and playwright install chromium: node booth/windows-kit/assets/render-assets.mjs
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const page = async (browser, width, height) =>
  browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })

// One 256x256 PNG inside an ICO container (Windows Vista and later read PNG icon entries).
const ico = (png) => {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header.writeUInt8(0, 6) // width 256
  header.writeUInt8(0, 7) // height 256
  header.writeUInt16LE(1, 10) // planes
  header.writeUInt16LE(32, 12) // bits per pixel
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18)
  return Buffer.concat([header, png])
}

const browser = await chromium.launch()
try {
  const wall = await page(browser, 1920, 1080)
  await wall.goto(pathToFileURL(join(here, 'wallpaper.html')).href)
  await wall.screenshot({ path: join(here, 'wallpaper.png') })
  for (const mode of ['start', 'decision']) {
    const icon = await page(browser, 256, 256)
    await icon.goto(`${pathToFileURL(join(here, 'icon.html')).href}?mode=${mode}`)
    const png = await icon.screenshot({ omitBackground: true })
    await writeFile(join(here, `${mode}.ico`), ico(png))
  }
} finally {
  await browser.close()
}
