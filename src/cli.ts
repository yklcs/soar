import { Command } from "commander"
import { Server, Builder } from "./site.js"
import { log } from "./log.js"

const program = new Command().version(process.env.npm_package_version ?? "")

program
	.command("build")
	.alias("b")
	.description("Build static pages from JSX")
	.argument("[dir]", "directory", process.cwd())
	.action(async (dir) => {
		const start = performance.now()

		const builder = new Builder({ rootdir: dir })
		await builder.process()
		await builder.build()

		const end = performance.now()
		log(`Built in ${((end - start) / 1000).toFixed(3)}s`)
	})

program
	.command("serve")
	.alias("s")
	.description("Serve Soar site")
	.argument("[dir]", "directory", process.cwd())
	.option("-p, --port <port>", "server port", "8000")
	.action(async (dir, opts) => {
		const server = new Server({ rootdir: dir, port: opts.port })
		await server.process()
		await server.serve()
	})

program.parse(process.argv)
