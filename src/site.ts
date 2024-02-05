import { globby } from "globby"
import * as path from "node:path"
import * as esbuild from "esbuild"
import * as fs from "node:fs/promises"
import * as vm from "node:vm"
import { JSX, render, renderToString } from "./jsx.js"
import fastify, { type FastifyInstance } from "fastify"
import fastifyStatic from "@fastify/static"

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
	server?: FastifyInstance

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
			[...this.files.entries()].filter(
				([_, entry]) =>
					[".tsx", ".jsx"].includes(entry.ext) &&
					!path.basename(entry.abs).startsWith("_"),
			),
		)
	}

	generators(): Files {
		return new Map(
			[...this.files.entries()].filter(
				([_, entry]) =>
					[".tsx", ".jsx"].includes(entry.ext) &&
					withExt(path.basename(entry.abs), "") === "_",
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

		await esbuild.build({
			entryPoints: [...this.pages().keys(), ...this.generators().keys()],
			bundle: true,
			jsx: "automatic",
			jsxImportSource: "soar",
			platform: "node",
			format: "esm",
			alias: {
				soar: path.resolve(import.meta.dirname, ".."),
			},
			outdir: this.builddir,
		})

		for (const [filename, entry] of this.nonpages()) {
			await fs.copyFile(filename, path.join(this.builddir, entry.rel))
		}

		await fs.writeFile(
			path.join(this.builddir, "package.json"),
			JSON.stringify({
				type: "module",
			}),
		)

		await fs.copyFile(
			path.join(import.meta.dirname, "jsx.d.ts"),
			path.join(this.builddir, "jsx.d.ts"),
		)
	}

	async build() {
		const generator = "Soar"
		await fs.mkdir(this.outdir, { recursive: true })

		for (const [_, entry] of this.pages()) {
			const modpath = withExt(path.join(this.builddir, entry.rel), ".js")
			const mod = await import(modpath)
			const Page = mod.default

			const url = resolveIndices(entry.rel)
			const props: JSX.PageProps = { url, generator }
			const html = await renderToString(Page(props))

			const file = path.join(this.outdir, url, "index.html")
			await fs.mkdir(path.dirname(file), { recursive: true })
			await fs.writeFile(file, html)
		}

		for (const [_, entry] of this.generators()) {
			const modpath = withExt(path.join(this.builddir, entry.rel), ".js")
			const mod = await import(modpath)
			const gen: Record<string, JSX.FunctionalElement> = mod.default

			for (const [slug, Page] of Object.entries(gen)) {
				const url = path.join(path.dirname(entry.rel), slug)
				const props: JSX.PageProps = { url, generator }
				const html = await renderToString(Page(props))

				const file = path.join(this.outdir, url, "index.html")
				await fs.mkdir(path.dirname(file), { recursive: true })
				await fs.writeFile(file, html)
			}
		}

		for (const [filename, entry] of this.nonpages()) {
			await fs.copyFile(filename, path.join(this.outdir, entry.rel))
		}
	}

	async serve() {
		this.server = fastify({ logger: false })
		this.server.register(fastifyStatic, {
			root: this.rootdir,
			wildcard: false,
		})

		this.server.get("/*", async (req, res) => {
			const url = path.normalize(req.url)
			const src = await findPathFromUrl(url, this.rootdir)
			if (src === undefined) {
				res.callNotFound()
				return
			}

			const output = await esbuild.build({
				stdin: {
					contents: `
						import Page from "./${path.relative(this.rootdir, src)}"
						import { render, renderToString } from "soar/jsx-runtime"
						renderToString(Page())
					`,
					resolveDir: this.rootdir,
				},
				bundle: true,
				write: false,
				jsx: "automatic",
				jsxImportSource: "soar",
				platform: "node",
				format: "esm",
				alias: {
					soar: path.resolve(import.meta.dirname, ".."),
				},
			})
			const built = output.outputFiles[0].text
			const html = await vm.runInThisContext(built)

			res.type("text/html")
			res.send(html)
		})

		this.server.listen({ port: 8000 })
	}
}

/**
 * Resolves possible indices in paths.
 */
const resolveIndices = (file: string) => {
	const noExt = withExt(file, "")
	if (path.basename(noExt) === "index") {
		return stripTrailingSlash(path.dirname(noExt))
	}
	return noExt
}

const stripTrailingSlash = (str: string) => {
	return str.replace(/\/+$/g, "")
}

const findPathFromUrl = async (
	url: string,
	root: string,
): Promise<string | undefined> => {
	const joined = path.join(root, url)
	const resolved = resolveIndices(joined)
	const basenames = ["index.tsx", "index.jsx"]
	const extnames = [".tsx", ".jsx"]

	for (const extname of extnames) {
		const file = withExt(resolved, extname)
		if (await fileExists(file)) {
			return file
		}
	}

	for (const basename of basenames) {
		const file = path.join(resolved, basename)
		if (await fileExists(file)) {
			return file
		}
	}
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

export { Site }
