import type { InitializeHook, LoadHook } from "node:module"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import * as mdx from "@mdx-js/mdx"
import { readFile } from "node:fs/promises"
import type { SoarConfig } from "config.js"
import * as esbuild from "esbuild"

interface MdxLoaderData {
	configFile: string
}

let __config: SoarConfig | undefined

const initialize: InitializeHook = async ({ configFile }: MdxLoaderData) => {
	__config = (await import(configFile)).default
}

const load: LoadHook = async (url, ctx, nextHook) => {
	const urlurl = new URL(url)
	if (urlurl.protocol === "file:") {
		const file = fileURLToPath(urlurl)
		const ext = path.extname(file).slice(1)

		if (ext === "mdx") {
			const source = await readFile(file)
			const tsx = String(
				await mdx.compile(source, {
					jsx: true,
					jsxImportSource: "soar",
					remarkPlugins: __config?.remarkPlugins,
					rehypePlugins: __config?.rehypePlugins,
				}),
			)
			const transformed = await esbuild.transform(tsx, {
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
	}

	return nextHook(url)
}

export { resolve } from "./esbuild.js"
export { initialize, load }
