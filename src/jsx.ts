import { parseHTML } from "linkedom"

interface VNode {
	type: JSX.ElementType
	children?: JSX.Children
	props: JSX.Props
}

const jsx = (
	type: JSX.ElementType,
	{ children, ...props }: JSX.Props,
): VNode => ({
	type,
	children,
	props,
})

const renderToString = async (root: VNode): Promise<string> => {
	const { document } = parseHTML(
		"<!DOCTYPE html><html><head></head><body></body></html>",
	)
	await render(root, document)
	return document.toString()
}

const render = async (root: VNode, document: Document): Promise<undefined> => {
	const _render = async (children: JSX.Children, parent: Node) => {
		if (Array.isArray(children)) {
			for (const child of children) {
				_render(child, parent)
			}
			return
		}

		if (typeof children === "string") {
			const text = document.createTextNode(children)
			parent.appendChild(text)
			return
		}

		if (typeof children.type === "string") {
			let el: HTMLElement
			if (
				children.type === "html" ||
				children.type === "head" ||
				children.type === "body"
			) {
				// biome-ignore lint/style/noNonNullAssertion: document will have these elements
				el = document.querySelector(children.type)!
			} else {
				el = document.createElement(children.type)
				parent.appendChild(el)
			}
			children.children && _render(children.children, el)
		} else if (typeof children.type === "function") {
			const inner = await children.type({
				...children.props,
				children: children.children,
			})
			_render(inner, parent)
		} else {
			console.log(children)
		}
	}

	await _render(root, document)
}

const Fragment = ({ children }: JSX.Props) => children

declare namespace JSX {
	type Children = string | VNode | Children[]

	interface PageProps extends Props {
		url: string
		generator: string
	}
	interface Props extends BaseProps {}
	interface BaseProps {
		children?: Children
	}

	type Element = VNode
	type FunctionalElement = (props: Props) => VNode

	type ElementType =
		| Extract<keyof JSX.IntrinsicElements, string>
		| string
		| ((props: Props) => VNode)
		| ((props: Props) => Promise<VNode>)

	interface IntrinsicElements {
		// HTML
		a: unknown
		abbr: unknown
		address: unknown
		area: unknown
		article: unknown
		aside: unknown
		audio: unknown
		b: unknown
		base: unknown
		bdi: unknown
		bdo: unknown
		big: unknown
		blockquote: unknown
		body: unknown
		br: unknown
		button: unknown
		canvas: unknown
		caption: unknown
		cite: unknown
		code: unknown
		col: unknown
		colgroup: unknown
		data: unknown
		datalist: unknown
		dd: unknown
		del: unknown
		details: unknown
		dfn: unknown
		dialog: unknown
		div: unknown
		dl: unknown
		dt: unknown
		em: unknown
		embed: unknown
		fieldset: unknown
		figcaption: unknown
		figure: unknown
		footer: unknown
		form: unknown
		h1: unknown
		h2: unknown
		h3: unknown
		h4: unknown
		h5: unknown
		h6: unknown
		head: unknown
		header: unknown
		hgroup: unknown
		hr: unknown
		html: unknown
		i: unknown
		iframe: unknown
		img: unknown
		input: unknown
		ins: unknown
		kbd: unknown
		keygen: unknown
		label: unknown
		legend: unknown
		li: unknown
		link: unknown
		main: unknown
		map: unknown
		mark: unknown
		menu: unknown
		menuitem: unknown
		meta: unknown
		meter: unknown
		nav: unknown
		noindex: unknown
		noscript: unknown
		object: unknown
		ol: unknown
		optgroup: unknown
		option: unknown
		output: unknown
		p: unknown
		param: unknown
		picture: unknown
		pre: unknown
		progress: unknown
		q: unknown
		rp: unknown
		rt: unknown
		ruby: unknown
		s: unknown
		samp: unknown
		script: unknown
		section: unknown
		select: unknown
		small: unknown
		source: unknown
		span: unknown
		strong: unknown
		style: unknown
		sub: unknown
		summary: unknown
		sup: unknown
		table: unknown
		tbody: unknown
		td: unknown
		textarea: unknown
		tfoot: unknown
		th: unknown
		thead: unknown
		time: unknown
		title: unknown
		tr: unknown
		track: unknown
		u: unknown
		ul: unknown
		var: unknown
		video: unknown
		wbr: unknown

		// SVG
		svg: unknown

		animate: unknown
		animateTransform: unknown
		circle: unknown
		clipPath: unknown
		defs: unknown
		desc: unknown
		ellipse: unknown
		feBlend: unknown
		feColorMatrix: unknown
		feComponentTransfer: unknown
		feComposite: unknown
		feConvolveMatrix: unknown
		feDiffuseLighting: unknown
		feDisplacementMap: unknown
		feDistantLight: unknown
		feFlood: unknown
		feFuncA: unknown
		feFuncB: unknown
		feFuncG: unknown
		feFuncR: unknown
		feGaussianBlur: unknown
		feImage: unknown
		feMerge: unknown
		feMergeNode: unknown
		feMorphology: unknown
		feOffset: unknown
		fePointLight: unknown
		feSpecularLighting: unknown
		feSpotLight: unknown
		feTile: unknown
		feTurbulence: unknown
		filter: unknown
		foreignObject: unknown
		g: unknown
		image: unknown
		line: unknown
		linearGradient: unknown
		marker: unknown
		mask: unknown
		metadata: unknown
		path: unknown
		pattern: unknown
		polygon: unknown
		polyline: unknown
		radialGradient: unknown
		rect: unknown
		stop: unknown
		switch: unknown
		symbol: unknown
		text: unknown
		textPath: unknown
		tspan: unknown
		use: unknown
		view: unknown
	}
}

export { render, renderToString, jsx, jsx as jsxs, Fragment, JSX }
