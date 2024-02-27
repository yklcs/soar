import { globby } from "globby"
import * as path from "node:path"
import * as fs from "node:fs/promises"
import type { JSX } from "./jsx.js"
import type { SoarConfig } from "config.js"
import { register } from "node:module"

interface File {
	abs: string
	rel: string
	ext: string

	underscore: boolean
	type: FileType
}

type FileType =
	| "page"
	| "generator"
	| "style"
	| "script"
	| "unknown"
	| "ignored"

interface SiteOptions {
	rootdir?: string
}

type Page = JSX.FunctionalElement<JSX.PageProps>
type Generator = Record<string, Page>

const fileType = (basename: string): FileType => {
	switch (path.extname(basename)) {
		case ".jsx":
		case ".tsx": {
			if (withExt(basename, "") === "_") {
				return "generator"
			}
			if (basename.startsWith("_")) {
				return "ignored"
			}
			return "page"
		}
		case ".mdx":
			return "page"
		case ".css":
			return "style"
		case ".ts":
		case ".js":
			return "script"
		default:
			return "unknown"
	}
}

class Site {
	_files: File[]
	rootdir: string
	config?: SoarConfig
	engine: string

	constructor(opts: SiteOptions) {
		this._files = []
		this.rootdir = path.resolve(opts.rootdir ?? process.cwd())
		this.engine = "Soar"
	}

	async init() {
		register("./loader/esbuild.js", import.meta.url)
		register("./loader/mdx.js", {
			parentURL: import.meta.url,
			data: {
				configFile: path.join(this.rootdir, "Soar.ts"),
			},
		})

		await this.scanFiles()
		await this.configure()
	}

	async scanFiles() {
		const files = await globby(this.rootdir, {
			cwd: this.rootdir,
			ignoreFiles: [".ignore", ".soarignore"],
		})
		this._files = files.map((file) => ({
			abs: file,
			rel: path.relative(this.rootdir, file),
			ext: path.extname(file),
			type: fileType(path.basename(file)),
			underscore: path.basename(file).startsWith("_"),
		}))
	}

	files(type?: FileType): File[] {
		return type ? this._files.filter((file) => file.type === type) : this._files
	}

	async configure(): Promise<SoarConfig | undefined> {
		const file = path.join(this.rootdir, "Soar.ts")
		if (!(await fileExists(file))) {
			return undefined
		}

		const { default: config }: { default?: SoarConfig } = await import(file)
		this.config = config

		return this.config
	}
}

const stripTrailingSlash = (str: string) => {
	return str.replace(/\/+$/g, "")
}

const withExt = (file: string, ext: string) =>
	`${path.join(
		path.dirname(file),
		path.basename(file, path.extname(file)),
	)}${ext}`

const fileExists = async (file: string) => {
	return await fs
		.access(file)
		.then(() => true)
		.catch(() => false)
}

export { Site, stripTrailingSlash, withExt, fileExists }
export type { SiteOptions, FileType, File, Page, Generator }
