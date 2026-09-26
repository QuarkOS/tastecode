#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { access, mkdir, readFile, rm, writeFile, appendFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')
const dataDir = process.env.VERIFY_TASTECODE_DATA ?? '/tmp/tastecode-verify/data'
const stateDir = process.env.VERIFY_TASTECODE_STATE ?? '/tmp/tastecode-verify/state'
const evidenceDir = process.env.VERIFY_TASTECODE_EVIDENCE ?? '/tmp/tastecode-verify/evidence'
const debugPort = Number(process.env.HARNESS_DEBUG_PORT ?? 9333)
const vitePort = 5183
const serverPort = 4311
const runFile = path.join(stateDir, 'run.json')
const devLog = path.join(stateDir, 'dev.log')
const transcriptFile = path.join(evidenceDir, 'transcript.txt')

const command = process.argv[2]
const flags = parseFlags(process.argv.slice(3))

try {
  if (command === 'launch') await launch()
  else if (command === 'doctor') await doctor()
  else if (command === 'click') await click(required(flags, 'name'), flags.row)
  else if (command === 'fill') await fill(required(flags, 'label'), required(flags, 'value'))
  else if (command === 'wait-text') await waitForText(required(flags, 'text'))
  else if (command === 'snapshot') await snapshot(required(flags, 'path'))
  else if (command === 'screenshot') await screenshot(required(flags, 'path'))
  else if (command === 'storage') await storage(required(flags, 'key'))
  else if (command === 'cleanup') await cleanup()
  else {
    console.error(
      'Usage: drive.mjs <launch|doctor|click|fill|wait-text|snapshot|screenshot|storage|cleanup>',
    )
    process.exitCode = 1
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[verify-tastecode] ${message}`)
  await note('error', message)
  process.exitCode = 1
}

function parseFlags(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token?.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      parsed[key] = 'true'
      continue
    }
    parsed[key] = value
    index += 1
  }
  return parsed
}

function required(parsed, key) {
  const value = parsed[key]
  if (!value) throw new Error(`Missing --${key}`)
  return value
}

async function ensureDisplay() {
  if (process.platform !== 'linux') return { name: process.env.DISPLAY ?? '', xvfbPid: undefined }
  if (process.env.DISPLAY) return { name: process.env.DISPLAY, xvfbPid: undefined }
  const socket = '/tmp/.X11-unix/X99'
  try {
    await access(socket)
    throw new Error('DISPLAY is unset and Xvfb display :99 is already in use.')
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DISPLAY is unset')) throw error
  }
  const child = spawn('Xvfb', [':99', '-screen', '0', '1280x800x24'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  child.once('error', () => undefined)
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      await access(socket)
      return { name: ':99', xvfbPid: child.pid }
    } catch {
      if (child.exitCode != null) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error('DISPLAY is unset and Xvfb :99 did not start. Install xvfb or set DISPLAY.')
}

function nodeVersionOk() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  return major > 22 || (major === 22 && minor >= 18)
}

function connect(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect(port, host)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function listenerPid(port) {
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const { stdout } = await promisify(execFile)('ss', ['-H', '-ltnp', `sport = :${port}`])
    const match = stdout.match(/pid=(\d+)/)
    if (match) return Number(match[1])
  } catch {
    // ss is not installed on every machine. /proc is the fallback.
  }
  return listenerPidFromProc(port)
}

function listenerPidFromProc(port) {
  let inodes
  try {
    const lines = [
      ...readProc('/proc/net/tcp'),
      ...readProc('/proc/net/tcp6'),
    ]
    inodes = new Set()
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      const local = parts[1]
      const state = parts[3]
      if (!local || state !== '0A') continue
      const listenPort = Number.parseInt(local.slice(local.lastIndexOf(':') + 1), 16)
      if (listenPort === port) inodes.add(parts[9])
    }
  } catch {
    return undefined
  }
  if (inodes.size === 0) return undefined
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue
    let fds
    try {
      fds = readdirSync(`/proc/${pid}/fd`)
    } catch {
      continue
    }
    for (const fd of fds) {
      try {
        const target = readlinkSync(`/proc/${pid}/fd/${fd}`)
        const inode = /^socket:\[(\d+)\]$/.exec(target)?.[1]
        if (inode && inodes.has(inode)) return Number(pid)
      } catch {
        // A descriptor can vanish while we read it.
      }
    }
  }
  return undefined
}

function readProc(file) {
  try {
    return readFileSync(file, 'utf8').split('\n').slice(1)
  } catch {
    return []
  }
}

async function note(step, detail) {
  await mkdir(evidenceDir, { recursive: true })
  const line = `${new Date().toISOString()} ${step}: ${detail}\n`
  await appendFile(transcriptFile, line)
}

async function launch() {
  if (!nodeVersionOk()) {
    throw new Error(`Node ${process.versions.node} is below 22.18.0; node:sqlite needs FTS5`)
  }
  for (const port of [vitePort, serverPort, debugPort]) {
    if (await connect(port)) throw new Error(`Port ${port} is already in use. Refusing to launch.`)
  }
  await mkdir(dataDir, { recursive: true })
  await mkdir(stateDir, { recursive: true })
  await mkdir(evidenceDir, { recursive: true })
  const display = await ensureDisplay()
  const log = await import('node:fs').then((fs) => fs.openSync(devLog, 'a'))
  const child = spawn('pnpm', ['dev'], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      DISPLAY: display.name,
      HARNESS_DATA_DIR: dataDir,
      HARNESS_DESKTOP_DATA_DIR: path.join(dataDir, 'desktop'),
      HARNESS_DISABLE_GPU: process.env.HARNESS_DISABLE_GPU ?? '1',
      HARNESS_DEBUG_PORT: String(debugPort),
    },
  })
  child.unref()
  await writeFile(
    runFile,
    JSON.stringify(
      {
        pid: child.pid,
        xvfbPid: display.xvfbPid,
        dataDir,
        desktopDataDir: path.join(dataDir, 'desktop'),
        debugPort,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  await note('launch', `pid ${child.pid} data ${dataDir} debug ${debugPort}`)
  const deadline = Date.now() + 180_000
  let last = 'starting'
  while (Date.now() < deadline) {
    try {
      await doctor({ quiet: true })
      last = 'waiting for Welcome to TasteCode'
      const visible = await evaluate(
        `document.body?.innerText?.includes(${JSON.stringify('Welcome to TasteCode')}) ?? false`,
      )
      if (visible) {
        console.log(`[verify-tastecode] ready pid ${child.pid}`)
        await note('ready', `pid ${child.pid}`)
        return
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`TasteCode did not become ready: ${last}`)
}

async function doctor(options = {}) {
  const problems = []
  if (!nodeVersionOk()) problems.push(`node ${process.versions.node} is below 22.18.0`)
  let run
  try {
    run = JSON.parse(await readFile(runFile, 'utf8'))
  } catch {
    problems.push(`missing ${runFile}`)
  }
  if (!(await connect(vitePort))) problems.push(`vite port ${vitePort} is closed`)
  if (!(await connect(serverPort))) problems.push(`server port ${serverPort} is closed`)
  if (!(await connect(debugPort))) problems.push(`CDP port ${debugPort} is closed`)
  let pageUrl = ''
  if (await connect(debugPort)) {
    const page = await findPage().catch((error) => {
      problems.push(error instanceof Error ? error.message : String(error))
      return undefined
    })
    pageUrl = page?.url ?? ''
    if (page && !page.url.startsWith(`http://127.0.0.1:${vitePort}`)) {
      problems.push(`renderer url is ${page.url}`)
    }
  }
  const vitePid = await listenerPid(vitePort)
  if (problems.length > 0) throw new Error(problems.join('; '))
  const summary = `node ${process.versions.node} vite ${vitePort} pid ${vitePid ?? 'unknown'} server ${serverPort} cdp ${debugPort} page ${pageUrl} data ${run?.dataDir ?? dataDir}`
  if (!options.quiet) {
    console.log(`[verify-tastecode] ${summary}`)
    await note('doctor', summary)
  }
}

async function findPage() {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
  if (!response.ok) throw new Error(`CDP list failed with ${response.status}`)
  const targets = await response.json()
  const page = targets.find(
    (target) => target.type === 'page' && String(target.url).includes(`127.0.0.1:${vitePort}`),
  )
  if (!page?.webSocketDebuggerUrl) throw new Error('No Vite page target on the debug port')
  return page
}

async function withCdp(work) {
  const page = await findPage()
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true })
  })
  let next = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(message.error.message))
    else waiter.resolve(message.result)
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++next
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  try {
    return await work(send)
  } finally {
    ws.close()
  }
}

async function evaluate(expression) {
  return withCdp(async (send) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'Page evaluation failed')
    }
    return result.result?.value
  })
}

async function click(name, row) {
  const found = await evaluate(`(() => {
    const wanted = ${JSON.stringify(name)}
    const rowName = ${JSON.stringify(row ?? '')}
    const nodes = [...document.querySelectorAll('button,[role="button"]')]
    const labelOf = (node) =>
      (node.getAttribute('aria-label') || node.innerText || '').replace(/\\s+/g, ' ').trim()
    const inRow = (node) => {
      if (!rowName) return true
      let parent = node.parentElement
      for (let depth = 0; depth < 8 && parent; depth += 1) {
        const title = parent.querySelector?.('.settings__row-title')
        const titleText = (title?.textContent || '').replace(/\\s+/g, ' ').trim()
        const text = (parent.innerText || '').replace(/\\s+/g, ' ').trim()
        if (titleText === rowName && text.length < 500) return true
        parent = parent.parentElement
      }
      return false
    }
    const el = nodes.find((node) => {
      const label = labelOf(node)
      const named = label === wanted || label.startsWith(wanted + ' ') || label.startsWith(wanted)
      return named && inRow(node)
    })
    if (!el) return { ok: false, labels: nodes.map(labelOf).filter(Boolean).slice(0, 40) }
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const rect = el.getBoundingClientRect()
    return { ok: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, label: labelOf(el) }
  })()`)
  if (!found?.ok) throw new Error(`No control named ${JSON.stringify(name)}`)
  await withCdp(async (send) => {
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: found.x,
      y: found.y,
      button: 'left',
      clickCount: 1,
    })
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: found.x,
      y: found.y,
      button: 'left',
      clickCount: 1,
    })
  })
  console.log(`[verify-tastecode] clicked ${found.label} at ${Math.round(found.x)},${Math.round(found.y)}`)
  await note('click', `${found.label} @ ${Math.round(found.x)},${Math.round(found.y)}`)
}

async function fill(label, value) {
  const found = await evaluate(`(() => {
    const wanted = ${JSON.stringify(label)}
    const labels = [...document.querySelectorAll('label')]
    const match = labels.find((node) => node.textContent.replace(/\\s+/g, ' ').trim() === wanted)
    const labelled = match ? document.getElementById(match.htmlFor) : null
    const byAria = [...document.querySelectorAll('input, textarea')].find(
      (node) => (node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim() === wanted,
    )
    const input = labelled || byAria
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
      return { ok: false }
    }
    input.focus()
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return { ok: true }
  })()`)
  if (!found?.ok) throw new Error(`No field labeled ${JSON.stringify(label)}`)
  await withCdp(async (send) => {
    await send('Input.insertText', { text: value })
  })
  console.log(`[verify-tastecode] filled ${label}`)
  await note('fill', `${label} = ${value}`)
}

async function waitForText(text) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const visible = await evaluate(
      `document.body.innerText.includes(${JSON.stringify(text)})`,
    )
    if (visible) {
      console.log(`[verify-tastecode] saw ${JSON.stringify(text)}`)
      await note('wait-text', text)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(text)}`)
}

async function snapshot(destination) {
  const tree = await withCdp(async (send) => send('Accessibility.getFullAXTree'))
  const lines = []
  for (const node of tree.nodes ?? []) {
    const role = node.role?.value
    const name = node.name?.value
    if (!role || role === 'none' || role === 'generic' || role === 'InlineTextBox') continue
    if (!name) continue
    lines.push(`${role} ${JSON.stringify(name)}`)
  }
  const absolute = path.resolve(destination)
  await mkdir(path.dirname(absolute), { recursive: true })
  await writeFile(absolute, `${lines.join('\n')}\n`)
  console.log(`[verify-tastecode] snapshot ${absolute}`)
  await note('snapshot', absolute)
}

async function screenshot(destination) {
  const image = await withCdp(async (send) => {
    await send('Page.enable')
    return send('Page.captureScreenshot', { format: 'png' })
  })
  const absolute = path.resolve(destination)
  await mkdir(path.dirname(absolute), { recursive: true })
  await writeFile(absolute, Buffer.from(image.data, 'base64'))
  console.log(`[verify-tastecode] screenshot ${absolute}`)
  await note('screenshot', absolute)
}

async function storage(key) {
  const value = await evaluate(`localStorage.getItem(${JSON.stringify(key)})`)
  console.log(value ?? '')
  await note('storage', `${key}=${value ?? ''}`)
}

async function cleanup() {
  let run
  try {
    run = JSON.parse(await readFile(runFile, 'utf8'))
  } catch {
    console.log('[verify-tastecode] no run file; nothing to stop')
    return
  }
  if (run.pid) {
    try {
      process.kill(-run.pid, 'SIGTERM')
    } catch {
      try {
        process.kill(run.pid, 'SIGTERM')
      } catch {
        // The process already exited.
      }
    }
    const deadline = Date.now() + 8_000
    while (Date.now() < deadline && (await connect(vitePort))) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    if (await connect(vitePort)) {
      try {
        process.kill(-run.pid, 'SIGKILL')
      } catch {
        try {
          process.kill(run.pid, 'SIGKILL')
        } catch {
          // Already gone.
        }
      }
    }
  }
  if (run.xvfbPid) {
    try {
      process.kill(run.xvfbPid, 'SIGTERM')
    } catch {
      // The display we started is already gone.
    }
  }
  await rm(dataDir, { recursive: true, force: true })
  await rm(stateDir, { recursive: true, force: true })
  console.log('[verify-tastecode] cleaned launch state; evidence kept')
  await note('cleanup', `removed ${dataDir} and ${stateDir}`)
}
