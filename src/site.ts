import chalk from "chalk"
import type { SoarConfig } from "config.js"
import express, { type Application } from "express"
import { globby } from "globby"
import ora from "ora"
import serveStatic from "serve-static"

import { existsSync } from "node:fs"
import * as fs from "node:fs/promises"
import { register } from "node:module"
import * as path from "node:path"

import type { JSX } from "./jsx.js"
import { error, log } from "./log.js"
import transforms, {
	type ContentTransform,
	type PathTransform,
} from "./transforms.js"

interface File {
	file: string
	path: string
	content?: string
}

interface SiteOptions {
	rootdir?: string
}

type Page = JSX.FunctionalElement<JSX.PageProps>
type Generator = Record<string, Page>

class Site {
	files: Map<string, File>
	rootdir: string
	config?: SoarConfig
	engine: string
	transforms: {
		path: PathTransform[]
		content: ContentTransform[]
	}

	constructor(opts: SiteOptions) {
		this.files = new Map()
		this.rootdir = path.resolve(opts.rootdir ?? process.cwd())
		this.engine = "Soar"
		this.transforms = {
			path: Object.values(transforms.path),
			content: Object.values(transforms.content),
		}
		log(`Source: ${this.rootdir}`)
	}

	private async register() {
		register("./loader/esbuild.js", import.meta.url)
		register("./loader/css.js", import.meta.url)
		register("./loader/mdx.js", {
			parentURL: import.meta.url,
			data: {
				configFile: path.join(this.rootdir, "Soar.ts"),
			},
		})
	}

	private async scan() {
		const files = await globby("**/*", {
			cwd: this.rootdir,
			absolute: true,
			ignore: [...(this.config?.ignore ?? []), "Soar.ts"],
		})

		const entries = files.map(async (abs): Promise<[string, File]> => {
			const rel = path.relative(this.rootdir, abs)
			const file = { file: abs, path: rel }

			const pathTransform = this.transforms.path.find(({ test }) => test(file))
			if (pathTransform) {
				const transformedPath = pathTransform.path(file)
				file.path = transformedPath
			}

			return [file.path, file]
		})

		this.files = new Map(await Promise.all(entries))
		log(`Discovered ${entries.length} files`)
	}

	private async configure(): Promise<SoarConfig | undefined> {
		const file = path.join(this.rootdir, "Soar.ts")
		if (!existsSync(file)) {
			return undefined
		}

		const { default: config }: { default?: SoarConfig } = await import(file)
		this.config = config

		return this.config
	}

	async init() {
		await this.register()
		await this.configure()
		await this.scan()
	}

	list() {
		return this.files.keys()
	}

	async get(path: string): Promise<string | Buffer | undefined> {
		const file = this.files.get(path)
		if (file === undefined) {
			return undefined
		}

		const contentTransform = this.transforms.content.find(({ test }) =>
			test(file),
		)

		if (contentTransform) {
			return contentTransform.content(file)
		} else {
			return fs.readFile(file.file)
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
		this.server.get("*", async (req, res) => {
			if (req.url.endsWith("/") || !req.url.includes(".")) {
				req.url = path.join(req.url, "index.html")
			}
			if (req.url.startsWith("/")) {
				req.url = req.url.slice(1)
			}

			const content = await this.get(req.url)

			if (content === undefined) {
				error(`404 ${req.url}`)
				return res.sendStatus(400)
			}

			res.contentType(path.basename(req.url))
			try {
				res.send(content)
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

		for (const path_ of this.list()) {
			const out = path.join(this.outdir, path_)
			await fs.mkdir(path.dirname(out), { recursive: true })

			try {
				const got = await this.get(path_)
				if (got === undefined) {
					throw new Error(`internal error: could not find ${path_}`)
				}
				await fs.writeFile(out, got)
			} catch (err) {
				console.error()
				error(`Error building ${path_}:`)
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
