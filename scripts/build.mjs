import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const source = join(root, 'public')
const dist = join(root, 'dist')

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })
cpSync(source, dist, { recursive: true })

console.log('Built La Lechera static site into dist/')
