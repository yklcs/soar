import path from "node:path"

const resolveIndexFile = (file: string) => {
	const noExt = withExt(file, "")
	if (path.basename(noExt) === "index") {
		return stripTrailingSlash(path.dirname(noExt))
	}
	return noExt
}

const stripTrailingSlash = (str: string) => {
	return str.replace(/\/+$/g, "")
}

const withExt = (file: string, ext: string) =>
	`${path.join(
		path.dirname(file),
		path.basename(file, path.extname(file)),
	)}${ext}`

export { resolveIndexFile, stripTrailingSlash, withExt }
