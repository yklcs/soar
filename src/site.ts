import { glob } from "glob"
import path from "path"

interface Entry {
	path: string
	ext: string
}

class Site {
	entries: Map<string, Entry>

	constructor() {
		this.entries = new Map()
	}

	async scanFs(root: string) {
		const files = await glob(path.join(root, "**"), {
			ignore: "node_modules/**",
			nodir: true,
		})
		this.entries = new Map(
			files.map((file) => [
				file,
				{
					path: file,
					ext: path.extname(file),
				},
			]),
		)
	}
}

export { Site }
