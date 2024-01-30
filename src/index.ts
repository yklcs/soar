import { Command } from "commander"
import { Site } from "./site.js"

const program = new Command().version(process.env.npm_package_version ?? "")

program
	.command("build")
	.alias("b")
	.description("Build static pages from JSX")
	.argument("[dir]", "directory", process.cwd())
	.action(async (dir) => {
		const site = new Site()
		await site.scanFs(dir)
		console.log(site.entries)
	})

program.parse(process.argv)
