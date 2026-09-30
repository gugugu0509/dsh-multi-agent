// 项目路径解析（唯一来源）。
//
// 默认取本文件所在目录的上一级（= 项目根）。
// 可用环境变量 DSH_PROJECT_DIR 覆盖 —— 但**这是信任边界**：它决定所有脚本读写哪个目录，
// 指向不可信目录会让脚本去读写那里的 room/、甚至被同目录下的伪装文件影响。
// 因此只在该目录确实像个协作项目目录（含 scripts/ 或 room/）时才采用，否则回退并告警。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DERIVED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let root = DERIVED
const override = process.env.DSH_PROJECT_DIR
if (override) {
  const cand = path.resolve(override)
  if (fs.existsSync(path.join(cand, 'scripts')) || fs.existsSync(path.join(cand, 'room'))) {
    root = cand
  } else {
    console.warn('[paths] 忽略 DSH_PROJECT_DIR（不像本项目目录：缺 scripts/ 与 room/）: ' + cand)
  }
}

export const ROOT = root
export const ROOM = path.join(ROOT, 'room')
