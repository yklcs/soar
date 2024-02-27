import type { LoadHook, ResolveHook } from "node:module"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"
import { readFile } from "node:fs/promises"

const needsTransform = ["ts", "tsx", "jsx"]

let i = 0

const resolve: ResolveHook = async (url, ctx, nextHook) => {
	const next = await nextHook(url)
	const urlurl = new URL(next.url)

	if (
		ctx.parentURL &&
		urlurl.protocol === "file:" &&
		!urlurl.pathname.includes("/node_modules/")
	) {
		const parentUrl = new URL(ctx.parentURL)
		const reload = parentUrl.searchParams.get("reload") ?? String(i++)
		urlurl.searchParams.set("reload", reload)
		next.url = urlurl.href
	}

	return next
}

const load: LoadHook = async (url, ctx, nextHook) => {
	const urlurl = new URL(url)
	if (urlurl.protocol === "file:") {
		const file = fileURLToPath(urlurl)
		const ext = path.extname(file).slice(1)

		if (!needsTransform.includes(ext)) {
			return nextHook(url)
		}

		const source = await readFile(file)
		const transformed = await esbuild.transform(source, {
			jsx: "automatic",
			jsxImportSource: "soar",
			loader: ext === "mdx" ? "tsx" : (ext as esbuild.Loader),
			platform: "node",
			format: "esm",
			sourcefile: file,
		})

		return {
			format: "module",
			source: transformed.code,
			shortCircuit: true,
		}
	}

	return nextHook(url)
}

export { resolve, load }
