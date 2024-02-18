import type { MDXComponents } from "mdx/types.js"

// export * from "./render.js"
// export * from "./site.js"

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
