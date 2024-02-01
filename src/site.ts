import { globby } from "globby"
import path from "path"
import * as esbuild from "esbuild"
import * as fs from "node:fs/promises"
import { render } from "./jsx.js"

interface File {
	abs: string
	rel: string
	ext: string
}

type Files = Map<string, File>

interface SiteOptions {
	rootdir?: string
	builddir?: string
	outdir?: string
}

class Site {
	files: Files
	rootdir: string
	builddir: string
	outdir: string

	constructor(opts: SiteOptions) {
		this.files = new Map()
		this.rootdir = path.resolve(opts.rootdir ?? process.cwd())
		this.builddir = path.resolve(
			opts.builddir ?? path.join(this.rootdir, ".soar"),
		)
		this.outdir = path.resolve(opts.outdir ?? path.join(this.rootdir, "dist"))
	}

	async scanFs() {
		const files = await globby(this.rootdir, {
			cwd: this.rootdir,
			gitignore: true,
		})
		this.files = new Map(
			files.map((file) => [
				file,
				{
					abs: file,
					rel: path.relative(this.rootdir, file),
					ext: path.extname(file),
				},
			]),
		)
	}

	pages(): Files {
		return new Map(
			[...this.files.entries()].filter(([_, entry]) =>
				[".tsx", ".jsx"].includes(entry.ext),
			),
		)
	}

	nonpages(): Files {
		return new Map(
			[...this.files.entries()].filter(
				([_, entry]) => ![".tsx", ".jsx"].includes(entry.ext),
			),
		)
	}

	async transform() {
		await fs.mkdir(this.builddir, { recursive: true })

		for (const [filename, entry] of this.pages()) {
			const built = await esbuild.transform(await fs.readFile(filename), {
				loader: "tsx",
				jsx: "automatic",
				jsxImportSource: "soar",
			})
			const outpath = withExt(path.join(this.builddir, entry.rel), ".js")
			await fs.writeFile(outpath, built.code)
		}

		for (const [filename, entry] of this.nonpages()) {
			await fs.copyFile(filename, path.join(this.builddir, entry.rel))
		}

		await fs.writeFile(
			path.join(this.builddir, "package.json"),
			`{ "type": "module" }`,
		)
	}

	async build() {
		await fs.mkdir(this.outdir, { recursive: true })

		for (const [filename, entry] of this.pages()) {
			const outpath = withExt(path.join(this.builddir, entry.rel), ".js")
			const mod = await import(outpath)
			const Page = mod.default
			const html = await render(Page())
			await fs.writeFile(
				withExt(path.join(this.outdir, entry.rel), ".html"),
				html,
			)
		}

		for (const [filename, entry] of this.nonpages()) {
			await fs.copyFile(filename, path.join(this.outdir, entry.rel))
		}
	}
}

const withExt = (file: string, ext: string) =>
	`${path.join(
		path.dirname(file),
		path.basename(file, path.extname(file)),
	)}${ext}`

export { Site }
