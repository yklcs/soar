import { Command } from "commander"
import packageJson from "../package.json" assert { type: "json" }

const program = new Command().version(packageJson.version)

program
	.command("build")
	.alias("b")
	.description("Build static pages from JSX")
	.action(async () => {
		console.log("hello world!")
	})

program.parse(process.argv)
