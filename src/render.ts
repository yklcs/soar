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

const applyScope = async (root: JSX.Children, scope: string) => {
	if (typeof root === "string") {
		return
	}
	if (Array.isArray(root)) {
		for (const child of root) {
			await applyScope(child, scope)
		}
	} else {
		if (root.scope === undefined) {
			root.scope = scope
		}
		root.children && (await applyScope(root.children, scope))
	}
}

const render = async (root: VNode, document: Document): Promise<undefined> => {
	const styles: Record<string, string> = {}

	const _render = async (
		node: JSX.Children,
		parent: Node,
	): Promise<RenderedNode> => {
		if (Array.isArray(node)) {
			return Promise.all(node.map((child) => _render(child, parent)))
		}

		if (typeof node === "string") {
			const text = document.createTextNode(node)
			parent.appendChild(text)
			return text
		}

		// new scopes are created for styled nodes or functional elements
		if (node.style !== undefined || typeof node.type === "function") {
			const newscope = (await digest(node.style ?? node.type.toString())).slice(
				0,
				8,
			)
			styles[newscope] = node.style ?? ""
			await applyScope(node, newscope)
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
				el.setAttribute(key, val.toString())
			}

			// set scope only if node is in a scope
			node.scope && el.setAttribute("scope", node.scope)

			node.children && (await _render(node.children, el))

			return el
		}

		if (typeof node.type === "function") {
			const inner = await node.type({
				...node.props,
				children: node.children,
			})

			// render children with new scope or old scope
			return await _render(inner, parent)
		}

		// fallback
		const text = document.createTextNode(node.toString())
		parent.appendChild(text)
		return text
	}

	await _render(root, document)

	const scopeCss = ([scope, style]: [string, string]) =>
		`[scope="${scope}"] {${style}}`
	const rawCss = Object.entries(styles).map(scopeCss).join("\n")

	const targets = browserslistToTargets(browserslist(">= 0.25%"))

	const css: string[] = []
	for (const [scope, rawCss] of Object.entries(styles)) {
		const { code, map } = transformCss({
			filename: "style.css",
			code: Buffer.from(rawCss),
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
					return [selector[0], scopeSelector, ...selector.slice(1)]
				},
			},
		})
		css.push(code.toString())
	}

	const style = document.createElement("style")
	style.textContent = css.join("\n")
	document.head.appendChild(style)
}

export { render, renderToString }
