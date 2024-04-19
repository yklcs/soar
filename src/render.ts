import browserslist from "browserslist"
import { browserslistToTargets, transform as transformCss } from "lightningcss"
import { parseHTML } from "linkedom"

import { JSX, VNode } from "./jsx.js"

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

type RenderedNode = null | Node | RenderedNode[]

const formatChildren = (children: JSX.Children): string => {
	if (
		typeof children === "boolean" ||
		children === undefined ||
		children === null
	) {
		return ""
	}
	if (Array.isArray(children)) {
		return `[${children.map(formatChildren).join(" ")}]`
	}
	if (typeof children === "string") {
		return ""
	}
	if (typeof children.type === "string") {
		return `${children.type}-${children.id}`
	}
	if (typeof children.type === "function") {
		return `${children.type.name}-${children.id}`
	}
	return ""
}

const render = async (root: VNode, document: Document): Promise<undefined> => {
	const styles: Map<string, string> = new Map()

	const _render = async (
		node: JSX.Children,
		parent: Node,
		depth: number,
	): Promise<RenderedNode> => {
		if (
			node === true ||
			node === false ||
			node === undefined ||
			node === null
		) {
			return null
		}

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

		if ("_$style" in node.props) {
			const style: string = node.props._$style.trim()
			node.scope = `s${await digest(style, 6)}`
			styles.set(node.scope, style)
		}

		if ("_$globalStyle" in node.props) {
			const current = styles.get("global") ?? ""
			styles.set("global", current + node.props._$globalStyle)
		}

		if (typeof node.type === "function") {
			const inner = await node.type({ ...node.props, children: node.children })
			return _render(inner, parent, depth + 1)
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
					if (typeof val === "string") {
						el.style.cssText = val
					} else {
						Object.assign(el.style, val)
					}
				} else if (key === "className" || key === "class") {
					if (Array.isArray(val)) {
						el.setAttribute("class", val.join(" ") ?? "")
					} else {
						el.setAttribute("class", val?.toString() ?? "")
					}
				} else if (key.startsWith("_")) {
				} else {
					el.setAttribute(key, val?.toString() ?? "")
				}
			}

			// set scope only if node is in a scope
			node.scope && el.classList.add(node.scope)
			node.children && (await _render(node.children, el, depth + 1))

			return el
		}

		// fallback
		const text = document.createTextNode(node.toString())
		parent.appendChild(text)
		return text
	}

	await _render(root, document, 0)

	const css = compileStyles(styles)
	const style = document.createElement("style")
	style.textContent = css
	document.head.appendChild(style)
}

const compileStyles = (styles: Map<string, string>) => {
	let compiled = ""
	for (const [scope, css] of styles) {
		if (scope === "global") {
			compiled += css
		} else {
			const scoped = `.${scope} { ${css} }`
			compiled += scoped
		}
	}

	const targets = browserslistToTargets(browserslist(">= 0.25%"))

	const { code } = transformCss({
		filename: "style.css",
		code: Buffer.from(compiled),
		minify: true,
		targets,
	})

	return code.toString()
}

export { render, renderToString }
