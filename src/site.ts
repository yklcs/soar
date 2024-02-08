import { globby } from "globby"
import * as path from "node:path"
import * as esbuild from "esbuild"
import * as fs from "node:fs/promises"
import { JSX, jsx } from "./jsx.js"
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
			const output = await esbuild.build(this.esbuildCfg(entry.abs))
			const built = output.outputFiles[0].text
			const dataUrl = `data:text/javascript;base64,${Buffer.from(
				built,
			).toString("base64")}`
			const mod = await import(dataUrl)
			const Page = mod.default

			const url = path.resolve("/", resolveIndices(entry.rel))
			const props: JSX.PageProps = { url, generator: this.engine }
			const html = await renderToString(
				jsx(Page, {
					url,
					generator: this.engine,
					children: undefined,
				}),
			)

			const file = path.join(this.outdir, url, "index.html")
			await fs.mkdir(path.dirname(file), { recursive: true })
			await fs.writeFile(file, html)
		}

		for (const [_, entry] of this.generators()) {
			const output = await esbuild.build(this.esbuildCfg(entry.abs))
			const built = output.outputFiles[0].text
			const dataUrl = `data:text/javascript;base64,${Buffer.from(
				built,
			).toString("base64")}`
			const mod = await import(dataUrl)
			const gentor: Generator = mod.default
			const gentorRecord: GeneratorRecord =
				typeof gentor === "function" ? await gentor() : gentor

			for (const [slug, Page] of Object.entries(gentorRecord)) {
				const url = path.join("/", path.dirname(entry.rel), slug)
				const props: JSX.PageProps = { url, generator: this.engine }
				const html = await renderToString(
					jsx(Page, {
						url,
						generator: this.engine,
						children: undefined,
					}),
				)

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
					const output = await esbuild.build(this.esbuildCfg(entry.abs))
					const built = output.outputFiles[0].text
					const dataUrl = `data:text/javascript;base64,${Buffer.from(
						built,
					).toString("base64")}`
					const mod = await import(dataUrl)
					const gentor = mod.default
					const gentorRecord: GeneratorRecord =
						typeof gentor === "function" ? await gentor() : gentor

					for (const [slug, Page] of Object.entries(gentorRecord)) {
						if (url === path.join("/", path.dirname(entry.rel), slug)) {
							const props: JSX.PageProps = { url, generator: this.engine }
							const html = await renderToString(
								jsx(Page, {
									url,
									generator: this.engine,
									children: undefined,
								}),
							)
							res.type("text/html")
							res.send(html)
							return
						}
					}
				}

				res.callNotFound()
				return
			}

			const output = await esbuild.build(this.esbuildCfg(src))
			const built = output.outputFiles[0].text
			const dataUrl = `data:text/javascript;base64,${Buffer.from(
				built,
			).toString("base64")}`
			const mod = await import(dataUrl)
			const Page = mod.default
			const html = await renderToString(
				jsx(Page, { url, generator: this.engine, children: undefined }),
			)

			res.type("text/html")
			res.send(html)
		})

		this.server.listen({ port: 8000 })
	}

	esbuildCfg(file: string): esbuild.BuildOptions & { write: false } {
		return {
			entryPoints: [file],
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
