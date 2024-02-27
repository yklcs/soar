import * as path from "node:path"
import * as esbuild from "esbuild"
import * as fs from "node:fs/promises"
import { jsx } from "./jsx.js"
import { renderToString } from "./render.js"
import { Site, stripTrailingSlash, withExt } from "./site.js"
import type { FileType, File, Page, Generator, SiteOptions } from "./site.js"

type BuilderPipeline = (
	inFile: File,
) => Promise<{ outPath: string; content: string }> | Promise<void>

interface BuilderOptions extends SiteOptions {
	outdir?: string
}

class Builder extends Site {
	outdir: string
	pipelines: Record<FileType, BuilderPipeline> = {
		page: this.page.bind(this),
		script: this.script.bind(this),
		generator: this.generator.bind(this),
		unknown: this.unknown.bind(this),
		style: this.unknown.bind(this),
		ignored: async () => {},
	}

	constructor(opts: BuilderOptions) {
		super(opts)
		this.outdir = path.resolve(opts.outdir ?? path.join(process.cwd(), "dist"))
	}

	async build() {
		await this.init()
		for (const [fileType, pipeline] of Object.entries(this.pipelines)) {
			for (const file of this.files(fileType as FileType)) {
				const result = await pipeline(file)
				if (result) {
					const { outPath, content } = result
					await fs.mkdir(path.dirname(outPath), { recursive: true })
					await fs.writeFile(outPath, content)
				}
			}
		}
	}

	async page(inFile: File) {
		const { default: page }: { default: Page } = await import(inFile.abs)
		const url = path.resolve("/", resolveIndexFile(inFile.rel))
		const props = { url, generator: this.engine, children: undefined }
		const html = await renderToString(jsx(page, props))
		const indexHtml = path.join(this.outdir, url, "index.html")
		return {
			outPath: indexHtml,
			content: html,
		}
	}

	async script(inFile: File) {
		await esbuild.build({
			entryPoints: [inFile.abs],
			bundle: true,
			write: true,
			platform: "browser",
			outdir: this.outdir,
			outbase: this.rootdir,
		})
	}

	async generator(inFile: File) {
		const { default: generator }: { default: Generator } = await import(
			inFile.abs
		)
		for (const [slug, Page] of Object.entries(generator)) {
			const url = path.join("/", path.dirname(inFile.rel), slug)
			const props = { url, generator: this.engine, children: undefined }
			const html = await renderToString(jsx(Page, props))
			const file = path.join(this.outdir, url, "index.html")
			await fs.mkdir(path.dirname(file), { recursive: true })
			await fs.writeFile(file, html)
		}
	}

	async unknown(inFile: File) {
		await fs.mkdir(path.dirname(path.join(this.outdir, inFile.rel)), {
			recursive: true,
		})
		await fs.copyFile(inFile.abs, path.join(this.outdir, inFile.rel))
	}
}

const resolveIndexFile = (file: string) => {
	const noExt = withExt(file, "")
	if (path.basename(noExt) === "index") {
		return stripTrailingSlash(path.dirname(noExt))
	}
	return noExt
}

export { Builder }
