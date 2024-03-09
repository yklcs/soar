import { globby } from "globby"
import * as path from "node:path"
import type { JSX } from "./jsx.js"
import type { SoarConfig } from "config.js"
import { register } from "node:module"
import * as fs from "node:fs/promises"
import { existsSync } from "node:fs"
import { type Action, default as pipeline } from "./pipeline.js"
import express, { type Application } from "express"
import serveStatic from "serve-static"
import { error, log } from "./log.js"
import ora from "ora"
import chalk from "chalk"

interface File {
	abs: string
	rel: string
	ext: string

	underscore: boolean
}

interface SiteOptions {
	rootdir?: string
}

type Page = JSX.FunctionalElement<JSX.PageProps>
type Generator = Record<string, Page>

class Site {
	files: File[]
	rootdir: string
	config?: SoarConfig
	engine: string
	actions: Action[] = []
	tree: Record<string, () => Promise<string | Buffer>> = {}

	constructor(opts: SiteOptions) {
		this.files = []
		this.rootdir = path.resolve(opts.rootdir ?? process.cwd())
		this.engine = "Soar"
		log(`Source: ${this.rootdir}`)
	}

	async register() {
		register("./loader/esbuild.js", import.meta.url)
		register("./loader/css.js", import.meta.url)
		register("./loader/mdx.js", {
			parentURL: import.meta.url,
			data: {
				configFile: path.join(this.rootdir, "Soar.ts"),
			},
		})
	}

	async scanFiles() {
		const files = await globby("**/*", {
			cwd: this.rootdir,
			absolute: true,
			ignore: [...(this.config?.ignore ?? []), "_*", "Soar.ts"],
		})
		this.files = files.map((file) => ({
			abs: file,
			rel: path.relative(this.rootdir, file),
			ext: path.extname(file),
			underscore: path.basename(file).startsWith("_"),
		}))
		log(`Discovered ${this.files.length} files`)
	}

	async configure(): Promise<SoarConfig | undefined> {
		const file = path.join(this.rootdir, "Soar.ts")
		if (!existsSync(file)) {
			return undefined
		}

		const { default: config }: { default?: SoarConfig } = await import(file)
		this.config = config

		return this.config
	}

	async process() {
		await this.register()
		await this.configure()
		await this.scanFiles()

		for (const file of this.files) {
			if (file.underscore) {
				this.actions.push({
					type: "copy",
					url: file.rel,
					from: file.abs,
				})
			} else if (file.ext in pipeline) {
				const actions = pipeline[file.ext](file)
				this.actions = [...this.actions, ...actions]
			} else {
				this.actions.push({
					type: "copy",
					url: file.rel,
					from: file.abs,
				})
			}
		}

		for (const action of this.actions) {
			switch (action.type) {
				case "copy": {
					this.tree[action.url] = async () => {
						return await fs.readFile(action.from)
					}
					break
				}
				case "create": {
					this.tree[action.url] = action.fn
					break
				}
				case "delete": {
					delete this.tree[action.url]
					break
				}
			}
		}
	}
}

interface ServerOptions extends SiteOptions {
	port: string
}

class Server extends Site {
	server: Application
	port: string

	constructor(opts: ServerOptions) {
		super(opts)
		this.server = express()
		this.port = opts.port
	}

	async serve() {
		this.server.get("*", async (req, res, next) => {
			if (req.url.endsWith("/") || !req.url.includes(".")) {
				req.url = path.join(req.url, "index.html")
			}
			if (req.url.startsWith("/")) {
				req.url = req.url.slice(1)
			}

			const fn = this.tree[req.url]

			if (fn === undefined) {
				error(`404 ${req.url}`)
				return res.sendStatus(400)
			}

			res.contentType(path.basename(req.url))
			try {
				res.send(await fn())
			} catch (err) {
				error(`Error serving ${req.url}:`)
				if (err instanceof Error) {
					err.stack && error(err.stack)
					res.status(500).send(err.stack)
				} else {
					res.sendStatus(500)
				}
			}
		})

		log(`Starting dev server at http://localhost:${this.port}`)
		this.server.use(serveStatic(this.rootdir))
		this.server.listen({ port: this.port })
	}
}

interface BuilderOptions extends SiteOptions {
	outdir?: string
}

class Builder extends Site {
	outdir: string
	actions: Action[] = []

	constructor(opts: BuilderOptions) {
		super(opts)
		this.outdir = path.resolve(opts.outdir ?? path.join(process.cwd(), "dist"))
		log(`Output: ${this.outdir}`)
	}

	async build() {
		const spinner = ora({
			text: "Building site",
			prefixText: chalk.blue("[Soar]"),
		}).start()

		for (const [file, fn] of Object.entries(this.tree)) {
			const out = path.join(this.outdir, file)
			await fs.mkdir(path.dirname(out), { recursive: true })

			try {
				await fs.writeFile(out, await fn())
			} catch (err) {
				console.error()
				error(`Error building ${file}:`)
				if (err instanceof Error) {
					err.stack && error(err.stack)
				}
			}
		}
		spinner.stop()
	}
}

export { Site, Server, Builder }
export type { SiteOptions, File, Page, Generator }
