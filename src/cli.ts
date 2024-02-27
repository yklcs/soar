import { Command } from "commander"
import { Builder } from "./builder.js"
import { Server } from "./server.js"

const program = new Command().version(process.env.npm_package_version ?? "")

program
	.command("build")
	.alias("b")
	.description("Build static pages from JSX")
	.argument("[dir]", "directory", process.cwd())
	.action(async (dir) => {
		const builder = new Builder({ rootdir: dir })
		await builder.build()
	})

program
	.command("serve")
	.alias("s")
	.description("Serve Soar site")
	.argument("[dir]", "directory", process.cwd())
	.action(async (dir) => {
		const server = new Server({ rootdir: dir })
		await server.serve()
	})

program.parse(process.argv)
