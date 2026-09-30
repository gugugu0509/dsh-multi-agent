// 项目路径解析（唯一来源）：默认取本文件所在目录的上一级（= 项目根），
// 可用环境变量 DSH_PROJECT_DIR 覆盖。所有脚本从这里取路径，不写死绝对路径。
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = process.env.DSH_PROJECT_DIR
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ROOM = path.join(ROOT, 'room')