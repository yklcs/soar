import { globby } from "globby"
import * as path from "node:path"
import * as esbuild from "esbuild"
import * as fs from "node:fs/promises"
import * as vm from "node:vm"
import { JSX } from "./jsx.js"
import { renderToString } from "./render.js"
import fastify, { type FastifyInstance } from "fastify"
import fastifyStatic from "@fastify/static"
import mdx from "@mdx-js/esbuild"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

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

type GeneratorRecord = Record<string, JSX.FunctionalElement>
type Generator =
	| GeneratorRecord
	| (() => GeneratorRecord | Promise<GeneratorRecord>)

class Site {
	files: Files
	rootdir: string
	outdir: string
	server?: FastifyInstance
	engine: string

	constructor(opts: SiteOptions) {
		this.files = new Map()
		this.rootdir = path.resolve(opts.rootdir ?? process.cwd())
		this.outdir = path.resolve(opts.outdir ?? path.join(process.cwd(), "dist"))
		this.engine = "Soar"
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
					[".tsx", ".jsx", ".mdx", ".md"].includes(entry.ext) &&
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
				([_, entry]) => ![".tsx", ".jsx", ".mdx", ".md"].includes(entry.ext),
			),
		)
	}

	async build() {
		await fs.mkdir(this.outdir, { recursive: true })

		for (const [_, entry] of this.pages()) {
			const output = await esbuild.build(this.esbuildCfg(entry.rel))
			const built = output.outputFiles[0].text
			const Page = vm.runInThisContext(built, { filename: `${entry.rel}:vm` })

			const url = path.resolve("/", resolveIndices(entry.rel))
			const props: JSX.PageProps = { url, generator: this.engine }
			const html = await renderToString(await Page(props))

			const file = path.join(this.outdir, url, "index.html")
			await fs.mkdir(path.dirname(file), { recursive: true })
			await fs.writeFile(file, html)
		}

		for (const [_, entry] of this.generators()) {
			const output = await esbuild.build(this.esbuildCfg(entry.rel))
			const built = output.outputFiles[0].text
			const gentor: Generator = vm.runInThisContext(built, {
				filename: `${entry.rel}:vm`,
			})
			const gentorRecord: GeneratorRecord =
				typeof gentor === "function" ? await gentor() : gentor

			for (const [slug, Page] of Object.entries(gentorRecord)) {
				const url = path.join("/", path.dirname(entry.rel), slug)
				const props: JSX.PageProps = { url, generator: this.engine }
				const html = await renderToString(await Page(props))

				const file = path.join(this.outdir, url, "index.html")
				await fs.mkdir(path.dirname(file), { recursive: true })
				await fs.writeFile(file, html)
			}
		}

		for (const [filename, entry] of this.nonpages()) {
			await fs.mkdir(path.dirname(path.join(this.outdir, entry.rel)), {
				recursive: true,
			})
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
				await this.scanFs()
				for (const entry of this.generators().values()) {
					const output = await esbuild.build(this.esbuildCfg(entry.rel))
					const built = output.outputFiles[0].text
					const gentor: Generator = vm.runInThisContext(built, {
						filename: `${entry.rel}:vm`,
					})
					const gentorRecord: GeneratorRecord =
						typeof gentor === "function" ? await gentor() : gentor

					for (const [slug, Page] of Object.entries(gentorRecord)) {
						if (url === path.join("/", path.dirname(entry.rel), slug)) {
							const props: JSX.PageProps = { url, generator: this.engine }
							const html = await renderToString(await Page(props))
							res.type("text/html")
							res.send(html)
							return
						}
					}
				}

				res.callNotFound()
				return
			}

			const output = await esbuild.build(
				this.esbuildCfg(path.relative(this.rootdir, src)),
			)
			const built = output.outputFiles[0].text
			const Page = vm.runInThisContext(built)
			const html = await renderToString(
				await Page({ url, generator: this.engine }),
			)

			res.type("text/html")
			res.send(html)
		})

		this.server.listen({ port: 8000 })
	}

	esbuildCfg(file: string): esbuild.BuildOptions & { write: false } {
		return {
			stdin: {
				contents: `
					import Page from "./${file}"
					globalThis.Page = Page
					Page
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
			plugins: [
				mdx({
					jsxImportSource: "soar",
					remarkPlugins: [remarkMath],
					rehypePlugins: [rehypeKatex],
				}),
			],
		}
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
	const extnames = [".tsx", ".jsx", ".mdx", ".md"]
	const basenames = extnames.map((ext) => `index${ext}`)

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

export { Site, type SiteOptions, type Generator }
