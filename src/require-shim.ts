import { createRequire } from "node:module"

globalThis.require = createRequire(__dirname)
