import {
	Fragment as solidFragment,
	jsx as solidJsx,
} from "solid-js/h/jsx-runtime"
import { JSX } from "solid-js/jsx-runtime"

const jsx = (type: JSX.ElementType, props: any) => {
	return solidJsx(type, props)
}

const Fragment = solidFragment

declare module "solid-js/jsx-runtime" {
	namespace JSX {
		type Props_ = JSX.ExplicitProperties
		type ElementType =
			| Extract<keyof JSX.IntrinsicElements, string>
			| ((props: any) => Element)
	}
}

export { jsx, jsx as jsxs, Fragment, JSX }
