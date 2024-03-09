import browserslist from "browserslist"
import { browserslistToTargets, bundle } from "lightningcss"
import { readFile } from "node:fs/promises"
import type { LoadHook } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const targets = browserslistToTargets(browserslist(">= 0.25%"))

const load: LoadHook = async (url, ctx, nextHook) => {
	const urlurl = new URL(url)
	if (urlurl.protocol === "file:") {
		const file = fileURLToPath(urlurl)
		if (path.extname(file) !== ".css") {
			return nextHook(url)
		}

		const { exports } = bundle({
			filename: file,
			cssModules: true,
			targets,
		})

		const mod = exports
			? Object.fromEntries(Object.entries(exports).map(([c, e]) => [c, e.name]))
			: {}

		return {
			format: "json",
			source: JSON.stringify(mod),
			shortCircuit: true,
		}
	}

	return nextHook(url)
}

export { load }
