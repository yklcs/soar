import browserslist from "browserslist"
import * as esbuild from "esbuild"
import { browserslistToTargets, bundle as bundleCss } from "lightningcss"

import path from "node:path"

import { jsx as jsx_ } from "./jsx.js"
import { resolveIndexFile, withExt } from "./path.js"
import { renderToString } from "./render.js"
import type { File, Page } from "./site.js"

type Action =
	| {
			type: "create" | "delete"
			url: string
			fn: () => Promise<string | Buffer>
	  }
	| {
			type: "copy"
			url: string
			from: string
	  }

type Pipeline = (file: File) => [Action]

const js: Pipeline = (file) => {
	const fn = async () => {
		const { outputFiles } = await esbuild.build({
			entryPoints: [file.abs],
			bundle: true,
			write: false,
			platform: "browser",
		})
		return outputFiles[0].text
	}

	return [
		{
			type: "create",
			url: withExt(file.rel, ".js"),
			fn,
		},
	]
}

const jsx: Pipeline = (file) => {
	const url = resolveIndexFile(file.rel)
	const fn = async () => {
		const { default: page }: { default: Page } = await import(file.abs)
		const props = {
			url: path.resolve("/", url),
			generator: "Soar",
			children: undefined,
		}
		const html = await renderToString(jsx_(page, props))
		return html
	}
	const indexHtml = path.join(url, "index.html")
	return [{ type: "create", url: indexHtml, fn }]
}

const targets = browserslistToTargets(browserslist(">= 0.25%"))

const css: Pipeline = (file) => {
	const fn = async () => {
		const { code } = bundleCss({
			filename: file.abs,
			cssModules: true,
			targets,
		})
		return Buffer.from(code)
	}
	return [{ type: "create", url: file.rel, fn }]
}

const pipeline: Record<string, Pipeline> = {
	".js": js,
	".ts": js,
	".jsx": jsx,
	".tsx": jsx,
	".mdx": jsx,
	".css": css,
}

export default pipeline
export type { Action, Pipeline }
