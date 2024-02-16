import { createRequire } from "node:module"
import path from "node:path"

globalThis.require = createRequire(process.cwd())
globalThis.__filename = process.cwd()
globalThis.__dirname = path.dirname(__filename)
