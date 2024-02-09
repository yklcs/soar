import {
	SelectorComponent,
	browserslistToTargets,
	transform as transformCss,
} from "lightningcss"
import browserslist from "browserslist"
import { parseHTML } from "linkedom"
import { JSX, VNode } from "jsx.js"

const renderToString = async (root: VNode): Promise<string> => {
	const { document } = parseHTML(
		"<!DOCTYPE html><html><head></head><body></body></html>",
	)
	await render(root, document)
	return document.toString()
}

const digest = async (message: string, length: number) => {
	const msgUint8 = new TextEncoder().encode(message)
	const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
	return hashHex.slice(0, length)
}

type RenderedNode = Node | RenderedNode[]

const formatChildren = (children: JSX.Children): string => {
	if (Array.isArray(children)) {
		return `[${children.map(formatChildren).join(" ")}]`
	} else if (typeof children === "string") {
		return ""
	} else if (typeof children.type === "string") {
		return `${children.type}-${children.id}`
	} else if (typeof children.type === "function") {
		return `${children.type.name}-${children.id}`
	} else {
		return ""
	}
}

const styles: Record<string, string> = {}

const prerender = async (root: VNode): Promise<VNode> => {
	const _prerender = async (
		node: JSX.Children,
		depth: number,
		scope: string,
	): Promise<JSX.Children> => {
		if (Array.isArray(node)) {
			const children = []
			for (const child of node) {
				children.push(await _prerender(child, depth, scope))
			}
			return children
		} else if (typeof node === "string") {
			return node
		}

		if (node.style) {
			scope = await digest(node.style, 6)
			styles[scope] = node.style
		}
		if (!node.scope) {
			node.scope = scope
		}

		if (node.children) {
			node.children = await _prerender(node.children, depth + 1, scope)
		}

		if (typeof node.type === "function") {
			const inner = await node.type({ ...node.props, children: node.children })
			node = await _prerender(inner, depth + 1, scope)
		}

		return node
	}

	root = await _prerender(root, 0, "_root") as VNode

	return root
}

const render = async (root: VNode, document: Document): Promise<undefined> => {
	root = await prerender(root)

	const _render = async (
		node: JSX.Children,
		parent: Node,
		depth: number,
	): Promise<RenderedNode> => {
		if (Array.isArray(node)) {
			const rendered = []
			for (const child of node) {
				rendered.push(await _render(child, parent, depth))
			}
			return rendered
		}

		if (typeof node === "string") {
			const text = document.createTextNode(node)
			parent.appendChild(text)
			return text
		}

		for (let i = 0; i < depth; i++) {
			process.stdout.write(" ")
		}

		if (typeof node.type === "string") {
			let el: HTMLElement
			if (
				node.type === "html" ||
				node.type === "head" ||
				node.type === "body"
			) {
				// biome-ignore lint/style/noNonNullAssertion: document will have these elements
				el = document.querySelector(node.type)!
			} else {
				el = document.createElement(node.type)
				parent.appendChild(el)
			}

			for (const [key, val] of Object.entries(node.props)) {
				if (key === "style") {
					Object.assign(el.style, val)
				} else if (key === "className") {
					el.setAttribute("class", val?.toString() ?? "")
				} else {
					el.setAttribute(key, val?.toString() ?? "")
				}
			}

			// set scope only if node is in a scope
			node.scope && el.setAttribute("scope", node.scope)
			node.children && (await _render(node.children, el, depth + 1))

			return el
		}

		if (typeof node.type === "function") {
			const inner = await node.type({
				...node.props,
				children: node.children,
			})

			// render children with new scope or old scope
			const rendered = await _render(inner, parent, depth + 1)
			return rendered
		}

		// fallback
		const text = document.createTextNode(node.toString())
		parent.appendChild(text)
		return text
	}

	await _render(root, document, 0)

	const targets = browserslistToTargets(browserslist(">= 0.25%"))

	const css: string[] = []
	for (const [scope, rawCss] of Object.entries(styles)) {
		const { code, map } = transformCss({
			filename: "style.css",
			code: Buffer.from(rawCss),
			minify: true,
			targets,
			visitor: {
				Selector(selector) {
					const scopeSelector: SelectorComponent = {
						type: "attribute",
						name: "scope",
						operation: {
							operator: "equal",
							value: scope,
						},
					}

					const fragments: {
						fragment: SelectorComponent[]
						global: boolean
					}[] = []

					for (let i = 0; i < selector.length; i++) {
						// build up a fragment
						const fragment = []
						let global = true
						for (let j = i; j < selector.length; i = ++j) {
							const jth = selector[j]

							if (
								jth.type !== "pseudo-class" ||
								jth.kind !== "custom-function" ||
								jth.name !== "global"
							) {
								global = false
							}
							fragment.push(jth)

							if (jth.type === "combinator") {
								break
							}
						}

						fragments.push({
							fragment,
							global,
						})
					}
					const scoped = fragments.flatMap(({ fragment, global }, i) => [
						...(global || i === 0 ? [] : [scopeSelector]),
						...fragment,
					])
					!fragments[fragments.length - 1].global && scoped.push(scopeSelector)
					return scoped
				},
			},
		})

		const noGlobals = code.toString().replace(/:global\(([\s\S]*?)\)/gm, "$1")
		css.push(noGlobals)
	}

	const style = document.createElement("style")
	style.textContent = css.join("")
	document.head.appendChild(style)
}

export { render, renderToString }
