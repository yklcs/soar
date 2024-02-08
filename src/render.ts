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

const digest = async (message: string) => {
	const msgUint8 = new TextEncoder().encode(message) // encode as (utf-8) Uint8Array
	const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8) // hash the message
	const hashArray = Array.from(new Uint8Array(hashBuffer)) // convert buffer to byte array
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("") // convert bytes to hex string
	return hashHex
}

type RenderedNode = Node | RenderedNode[]

const applyScope = async (
	root: JSX.Children,
	scope: string,
	rescope: boolean,
) => {
	if (typeof root === "string") {
		return
	}
	if (Array.isArray(root)) {
		for (const child of root) {
			applyScope(child, scope, rescope)
		}
	} else {
		// if (root.scope === undefined) {
		if (rescope && !root.__parentIsFn) {
			root.scope = scope
		}
		// }
		// if (root.__parentIsFn)
		root.children && applyScope(root.children, scope, rescope)
	}
}

const setParentIsFn = (root: JSX.Children) => {
	if (typeof root === "string") {
		return
	}
	if (Array.isArray(root)) {
		for (const child of root) {
			setParentIsFn(child)
		}
	} else {
		root.__parentIsFn = true
		root.children && setParentIsFn(root.children)
	}
}

const render = async (root: VNode, document: Document): Promise<undefined> => {
	const styles: Record<string, string> = {}

	const _render = async (
		node: JSX.Children,
		parent: Node,
		rescope = true,
		depth = 0,
	): Promise<RenderedNode> => {
		if (Array.isArray(node)) {
			const rendered = []
			for (const child of node) {
				rendered.push(await _render(child, parent, true, depth + 1))
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

		console.log(
			`${typeof node.type === "string" ? node.type : node.type.name} ${
				node.scope
			} ${node.__parentIsFn}`,
		)

		// new scopes are created for styled nodes or functional elements
		if (node.style !== undefined) {
			const newscope = (await digest(node.style)).slice(0, 8)
			styles[newscope] = node.style
			applyScope(node, newscope, rescope)
			node.scope = newscope
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

			node.children && (await _render(node.children, el, true, depth + 1))

			return el
		}

		if (typeof node.type === "function") {
			node.children && setParentIsFn(node.children)
			const inner = await node.type({
				...node.props,
				children: node.children,
			})

			// render children with new scope or old scope
			const rendered = await _render(inner, parent, true, depth + 1)
			return rendered
		}

		// fallback
		const text = document.createTextNode(node.toString())
		parent.appendChild(text)
		return text
	}

	await _render(root, document)

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
