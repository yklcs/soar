import { PluggableList } from "unified"

interface SoarConfig {
	rehypePlugins?: PluggableList
	remarkPlugins?: PluggableList
	ignore?: string[]
}

export type { SoarConfig }
