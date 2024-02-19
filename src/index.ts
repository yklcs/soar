import type { MDXComponents } from "mdx/types.js"
export type { SoarConfig } from "./config.js"

let mdxComponents = {}
export const useMDXComponents: (components?: MDXComponents) => MDXComponents = (
	components,
) => {
	if (components) {
		mdxComponents = components
		return mdxComponents
	}
	return mdxComponents
}
