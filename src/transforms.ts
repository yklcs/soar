import browserslist from "browserslist"
import * as esbuild from "esbuild"
import { browserslistToTargets, bundle as bundleCss } from "lightningcss"

import path from "node:path"

import { jsx as jsx_ } from "./jsx.js"
import { resolveIndexFile, withExt } from "./path.js"
import { renderToString } from "./render.js"
import type { File, Page } from "./site.js"

interface PathTransform {
	path: (from: File) => string
	test: (from: { file: string; path: string }) => boolean
}

const pathTransforms: Record<string, PathTransform> = {
	js: {
		path: ({ path }) => withExt(path, ".js"),
		test: ({ file }) => file.endsWith(".ts") || file.endsWith(".js"),
	},
	page: {
		path: (file) => {
			const indexified = resolveIndexFile(file.path)
			return path.join(indexified, "index.html")
		},
		test: ({ file }) =>
			!file.startsWith("_") && (file.endsWith(".tsx") || file.endsWith(".mdx")),
	},
}

interface ContentTransform {
	content: (from: File) => Promise<string>
	test: (from: { file: string; path: string }) => boolean
}

const targets = browserslistToTargets(browserslist(">= 0.25%"))

const contentTransforms: Record<string, ContentTransform> = {
	js: {
		content: async (file) => {
			const { outputFiles } = await esbuild.build({
				entryPoints: [file.file],
				bundle: true,
				write: false,
				platform: "browser",
			})
			return outputFiles[0].text
		},
		test: ({ file }) => file.endsWith(".ts") || file.endsWith(".js"),
	},
	page: {
		content: async (file) => {
			const { default: page }: { default: Page } = await import(file.file)
			const props = {
				url: path.resolve("/", file.path),
				generator: "Soar",
				children: undefined,
			}
			const content = await renderToString(jsx_(page, props))
			return content
		},
		test: ({ file }) =>
			!file.startsWith("_") && (file.endsWith(".tsx") || file.endsWith(".mdx")),
	},
	css: {
		content: async (file) => {
			const { code } = bundleCss({
				filename: file.file,
				cssModules: true,
				targets,
			})
			return code.toString()
		},
		test: ({ file }) =>
			!path.basename(file).startsWith("_") && file.endsWith(".css"),
	},
}

export default { path: pathTransforms, content: contentTransforms }
export type { PathTransform, ContentTransform }
