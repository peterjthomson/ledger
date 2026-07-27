/* global console, document, process */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const assetRoot = path.join(projectRoot, 'docs', 'app-store')
const screenshotDir = path.join(assetRoot, 'screenshots')
const brandDir = path.join(assetRoot, 'brand')

fs.mkdirSync(screenshotDir, { recursive: true })
fs.mkdirSync(brandDir, { recursive: true })

const dataUri = (filePath) => {
  const extension = path.extname(filePath).slice(1)
  const mime = extension === 'svg' ? 'image/svg+xml' : `image/${extension}`
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
}

const background = dataUri(path.join(assetRoot, 'backgrounds', 'git-graph-campaign.png'))
const icon = dataUri(path.join(projectRoot, 'resources', 'build', 'icon.png'))

const screenshots = [
  {
    number: '01',
    file: '01-workspace-at-a-glance.png',
    raw: '01-radar.png',
    accent: '#5B9FD8',
    title: 'Your whole Git workspace. One view.',
    subtitle:
      'Branches, worktrees, pull requests, commits, remotes, and stashes—always in context.',
  },
  {
    number: '02',
    file: '02-stage-commit-push.png',
    raw: '02-focus.png',
    accent: '#2AA198',
    title: 'Stage, commit, and push without breaking flow.',
    subtitle: 'Move from graph to working changes in one focused workspace.',
  },
  {
    number: '03',
    file: '03-pull-request-review.png',
    raw: '03-pr-review.png',
    accent: '#E86F51',
    title: 'Review pull requests in context.',
    subtitle: 'Conversation, files, commits, and merge controls stay side by side.',
  },
  {
    number: '04',
    file: '04-ai-review-signals.png',
    raw: '08-ai-pr-review.png',
    accent: '#E9C15B',
    title: 'See risk before the review starts.',
    subtitle: 'AI-assisted signals highlight oversized changes and missing review hygiene.',
  },
  {
    number: '05',
    file: '05-full-commit-graph.png',
    raw: '04-graph.png',
    accent: '#BFC7D5',
    title: 'Trace every branch, cleanly.',
    subtitle: 'A full-screen commit graph makes divergence, merges, and releases easy to scan.',
  },
]

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const sharedStyles = `
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
`

const screenshotHtml = (config, rawImage) => `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <style>
        ${sharedStyles}
        body {
          position: relative;
          color: #fff;
          background: #090b0e url("${background}") center / cover no-repeat;
        }
        body::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 78% 10%, ${config.accent}2e 0, transparent 32%),
            linear-gradient(180deg, rgba(3, 4, 6, .16), rgba(3, 4, 6, .52));
        }
        .brand {
          position: absolute;
          z-index: 2;
          left: 144px;
          top: 90px;
          display: flex;
          align-items: center;
          gap: 18px;
          color: rgba(255, 255, 255, .88);
          font-size: 31px;
          font-weight: 650;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .brand img { width: 56px; height: 56px; }
        .number {
          position: absolute;
          z-index: 2;
          right: 144px;
          top: 104px;
          color: rgba(255, 255, 255, .52);
          font-size: 27px;
          font-weight: 600;
          letter-spacing: .18em;
        }
        .copy {
          position: absolute;
          z-index: 2;
          left: 144px;
          top: 194px;
          max-width: 2480px;
        }
        h1 {
          margin: 0;
          color: #fff;
          font-size: 88px;
          line-height: 1.03;
          font-weight: 760;
          letter-spacing: -.048em;
        }
        p {
          margin: 24px 0 0;
          color: rgba(255, 255, 255, .68);
          font-size: 36px;
          line-height: 1.28;
          font-weight: 440;
          letter-spacing: -.012em;
        }
        .accent {
          width: 124px;
          height: 8px;
          margin-top: 29px;
          border-radius: 999px;
          background: ${config.accent};
          box-shadow: 0 0 32px ${config.accent}7f;
        }
        .window {
          position: absolute;
          z-index: 3;
          left: 144px;
          top: 502px;
          width: 2592px;
          height: 1620px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, .3);
          border-radius: 30px;
          background: #fff;
          box-shadow:
            0 44px 100px rgba(0, 0, 0, .58),
            0 8px 26px rgba(0, 0, 0, .38),
            0 0 0 10px rgba(255, 255, 255, .035);
        }
        .window img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top center;
        }
      </style>
    </head>
    <body>
      <div class="brand"><img src="${icon}" alt="">Ledger</div>
      <div class="number">${config.number} / 05</div>
      <div class="copy">
        <h1>${escapeHtml(config.title)}</h1>
        <p>${escapeHtml(config.subtitle)}</p>
        <div class="accent"></div>
      </div>
      <div class="window"><img src="${rawImage}" alt=""></div>
    </body>
  </html>
`

const wordmarkHtml = ({ dark }) => `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <style>
        ${sharedStyles}
        body {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 44px;
          background: ${dark ? '#0A0B0D' : '#F4F5F7'};
          color: ${dark ? '#FFFFFF' : '#101114'};
        }
        img { width: 230px; height: 230px; }
        span {
          font-size: 186px;
          line-height: 1;
          font-weight: 720;
          letter-spacing: -.07em;
          transform: translateY(-7px);
        }
      </style>
    </head>
    <body><img src="${icon}" alt=""><span>ledger</span></body>
  </html>
`

const socialCardHtml = `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <style>
        ${sharedStyles}
        body {
          position: relative;
          color: #fff;
          background: #090b0e url("${background}") center / cover no-repeat;
        }
        body::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(3, 4, 6, .22), rgba(3, 4, 6, .72));
        }
        .content {
          position: absolute;
          z-index: 2;
          left: 150px;
          top: 150px;
          display: flex;
          align-items: center;
          gap: 50px;
        }
        img { width: 240px; height: 240px; }
        .name {
          font-size: 185px;
          line-height: 1;
          font-weight: 740;
          letter-spacing: -.07em;
        }
        .tagline {
          position: absolute;
          z-index: 2;
          left: 164px;
          bottom: 160px;
          max-width: 1500px;
          font-size: 86px;
          line-height: 1.05;
          font-weight: 700;
          letter-spacing: -.045em;
        }
        .tagline span { color: #72B7F0; }
      </style>
    </head>
    <body>
      <div class="content"><img src="${icon}" alt=""><div class="name">ledger</div></div>
      <div class="tagline">Git work,<br><span>made visible.</span></div>
    </body>
  </html>
`

const waitForImages = (page) =>
  page.waitForFunction(() => [...document.images].every((image) => image.complete))

const browserExecutable = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].find((candidate) => candidate && fs.existsSync(candidate))

const browser = await chromium.launch({
  headless: true,
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
})

try {
  const screenshotPage = await browser.newPage({
    viewport: { width: 2880, height: 1800 },
    deviceScaleFactor: 1,
  })

  for (const config of screenshots) {
    const rawImage = dataUri(path.join(assetRoot, 'raw', config.raw))
    await screenshotPage.setContent(screenshotHtml(config, rawImage), {
      waitUntil: 'load',
    })
    await waitForImages(screenshotPage)
    await screenshotPage.screenshot({
      path: path.join(screenshotDir, config.file),
      type: 'png',
    })
  }

  await screenshotPage.close()

  for (const dark of [true, false]) {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 400 },
      deviceScaleFactor: 1,
    })
    await page.setContent(wordmarkHtml({ dark }), { waitUntil: 'load' })
    await waitForImages(page)
    await page.screenshot({
      path: path.join(brandDir, `ledger-wordmark-${dark ? 'dark' : 'light'}.png`),
      type: 'png',
    })
    await page.close()
  }

  const socialPage = await browser.newPage({
    viewport: { width: 2400, height: 1260 },
    deviceScaleFactor: 1,
  })
  await socialPage.setContent(socialCardHtml, { waitUntil: 'load' })
  await waitForImages(socialPage)
  await socialPage.screenshot({
    path: path.join(brandDir, 'ledger-social-card-2400x1260.png'),
    type: 'png',
  })
  await socialPage.close()
} finally {
  await browser.close()
}

fs.copyFileSync(
  path.join(projectRoot, 'resources', 'build', 'icon.png'),
  path.join(brandDir, 'ledger-app-icon-1024.png'),
)

console.log(`Rendered ${screenshots.length} App Store screenshots and 4 brand exports.`)
