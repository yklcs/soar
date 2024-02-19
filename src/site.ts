import { globby } from "globby"
import * as path from "node:path"
import * as esbuild from "esbuild"
import * as fs from "node:fs/promises"
import { JSX, jsx } from "./jsx.js"
import { renderToString } from "./render.js"
import fastify, { type FastifyInstance } from "fastify"
import fastifyStatic from "@fastify/static"
import mdx from "@mdx-js/esbuild"
import { pathToFileURL } from "node:url"
import { SoarConfig } from "config.js"

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

type Generator = Record<string, JSX.FunctionalElement>

class Site {
	files: Files
	rootdir: string
	outdir: string
	server?: FastifyInstance
	config?: SoarConfig
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
			ignoreFiles: [".ignore", ".soarignore"],
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

	async configure(): Promise<SoarConfig | undefined> {
		const file = path.join(this.rootdir, "Soar.ts")
		if (!(await fileExists(file))) {
			return undefined
		}

		const output = await esbuild.build(this.esbuildCfg(file))
		const built = output.outputFiles[0].text
		const dataUrl = `data:text/javascript;base64,${Buffer.from(built).toString(
			"base64",
		)}`
		const mod = await import(dataUrl)

		this.config = mod.default
		return this.config
	}

	async build() {
		await this.configure()
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

			for (const [slug, Page] of Object.entries(gentor)) {
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
		await this.configure()
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
					const gentor: Generator = mod.default

					for (const [slug, Page] of Object.entries(gentor)) {
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
		const filename = path.resolve(file)
		const dirname = path.dirname(filename)

		return {
			entryPoints: [file],
			bundle: true,
			write: false,
			jsx: "automatic",
			jsxImportSource: "soar",
			platform: "node",
			format: "esm",
			inject: [path.resolve(import.meta.dirname, "./require-shim.js")],
			plugins: [
				mdx({
					jsxImportSource: "soar",
					remarkPlugins: this.config?.remarkPlugins,
					rehypePlugins: this.config?.rehypePlugins,
					providerImportSource: "soar",
				}),
				{
					name: "import-meta",
					setup(build) {
						build.onLoad({ filter: /.*/ }, async ({ path: file }) => {
							let contents = await fs.readFile(file, "utf8")

							const url = pathToFileURL(file)
							const filename = file
							const dirname = path.dirname(file)

							contents = contents
								.replaceAll(
									"import.meta",
									JSON.stringify({
										url,
										filename,
										dirname,
									}),
								)
								.replaceAll("__dirname", JSON.stringify(dirname))
								.replaceAll("__filename", JSON.stringify(filename))

							return { contents, loader: "default" }
						})
					},
				},
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
