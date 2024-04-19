type Tag<T> = (strs: TemplateStringsArray, ...args: unknown[]) => T

interface Style {
	_$style: string
}

interface GlobalStyle {
	_$globalStyle: string
}

const isTemplateStringsArray = (arr: any): arr is TemplateStringsArray =>
	Array.isArray(arr) && "raw" in arr && Array.isArray(arr.raw)

function _css(strs: TemplateStringsArray, ...args: unknown[]): Style
function _css(...strs: string[]): Style
function _css(...styles: Style[]): Style
function _css(
	first: TemplateStringsArray | string | Style,
	...rest: any[]
): Style {
	if (isTemplateStringsArray(first)) {
		const _$style = rest.reduce(
			(acc: string, arg, idx) => `${acc}${String(arg)}${first[idx + 1]}`,
			first[0],
		)
		return { _$style }
	}
	if (typeof first === "string") {
		return {
			_$style: first + rest.join(""),
		}
	}
	return {
		_$style: rest.reduce(
			(acc, style: Style) => acc + style._$style,
			first._$style,
		),
	}
}

interface Css extends Tag<Style> {
	(...strs: string[]): Style
	(...styles: Style[]): Style
	global: Tag<GlobalStyle>
}

const css: Css = Object.assign(_css, {
	global: (strs: TemplateStringsArray, ...args: unknown[]) => {
		const compiled = args.reduce(
			(acc: string, arg, idx) => `${acc}${String(arg)}${strs[idx + 1]}`,
			strs[0],
		)

		return { _$globalStyle: compiled }
	},
})

export { css }
