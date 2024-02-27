import * as path from "node:path"
import * as esbuild from "esbuild"
import { jsx } from "./jsx.js"
import { renderToString } from "./render.js"
import express, { Application } from "express"
import serveStatic from "serve-static"
import { stripTrailingSlash, Site, withExt } from "./site.js"
import type { File, Page, SiteOptions } from "./site.js"

class Server extends Site {
	server: Application

	constructor(opts: SiteOptions) {
		super(opts)
		this.server = express()
	}

	async serve() {
		await this.init()

		this.server.get("*", async (req, res, next) => {
			const file = this.urlToFile(req.url)
			if (!file) {
				for (const file of this.files("generator")) {
					const { default: generator }: { default: Generator } = await import(
						file.abs
					)
					for (const [slug, page] of Object.entries(generator)) {
						if (req.url === path.join("/", path.dirname(file.rel), slug)) {
							const props = {
								url: req.url,
								generator: this.engine,
								children: undefined,
							}
							const html = await renderToString(jsx(page, props))
							return res.type("text/html").send(html)
						}
					}
				}
				return next()
			}

			switch (file.type) {
				case "page": {
					const { default: page }: { default: Page } = await import(file.abs)
					const props = {
						url: req.url,
						generator: this.engine,
						children: undefined,
					}
					const html = await renderToString(jsx(page, props))
					return res.type("text/html").send(html)
				}
				case "script": {
					const output = await esbuild.build({
						entryPoints: [file.abs],
						bundle: true,
						write: false,
						platform: "browser",
					})
					const built = output.outputFiles[0].text
					return res.type("text/javascript").send(built)
				}
				default: {
					return next()
				}
			}
		})

		this.server.use(serveStatic(this.rootdir))
		this.server.listen({ port: 8000 })
	}

	urlToFile(url: string): File | undefined {
		const joined = stripTrailingSlash(path.join(this.rootdir, url))

		if (path.basename(url).startsWith("_")) {
			return this.files().find((file) => file.abs === joined)
		}

		switch (path.extname(url)) {
			case ".js":
				return this.files("script").find(
					(file) => file.abs === joined || file.abs === withExt(joined, ".ts"),
				)
			case "": {
				const possible = [
					"/index.tsx",
					"/index.jsx",
					"/index.mdx",
					".tsx",
					".jsx",
					".mdx",
				].flatMap((ext) =>
					this.files("page").find((file) => file.abs === joined + ext),
				)
				return possible.find((file) => file)
			}
			default:
				return this.files().find((file) => file.abs === joined)
		}
	}
}

export { Server }
