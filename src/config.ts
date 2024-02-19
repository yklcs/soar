import { PluggableList } from "unified"

interface SoarConfig {
	rehypePlugins?: PluggableList
	remarkPlugins?: PluggableList
}

export type { SoarConfig }
