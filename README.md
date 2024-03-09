# Soar

Soar is a minimal opinionated static site generator built around JSX and filesystem routing.

Core ideas:

- Embrace JSX without serving client-side JS
- Leverage ES modules and Node's [custom module hooks](https://nodejs.org/api/module.html)
- Filesystem routing
- Scoped styles through CSS-in-JS and CSS modules
- Scripts and styles must be included explicitly to keep sites lean (manual `<script>` and `<link>` tags)

## Usage

```shell
# install (global)
$ npm i -g soar
$ pnpm i -g soar

# build site
$ soar build src/

# start dev server
$ soar serve src/
```

## Configuration

Soar does not need a config file for most things, but can be provided with one.
The default export of `Soar.ts` in the source directory will be used.
See [config.ts](./src/config.ts) for available options.

## Filesystem routing

The file tree within the source directory is used for building the output site.
This makes routing simple as creating a directory structure.
There are three exceptions to this rule:

1. Files and directories beginning with an underscore `_` are not included in the output.
   This can be used to exclude `_component.tsx` files from the output.
2. Pages are built into `$PAGE/index.html` and not `$PAGE.html`.
3. `ignore`d patterns in the `Soar.ts` config file are not included in the output.

## Pipelines

Pipelines transform source files before building and serving.

### JSX pipeline

The JSX pipeline treats `.tsx` and `.jsx` files with a `default` export as pages.
A [custom JSX runtime](./src/jsx.ts) is used to render JSX into HTML. Only functional elements are supported.

Component and layout files can be created without getting treated as pages by prefixing the file or directory name with an underscore (`_component.tsx`).

Attributes in JSX are passed through to HTML, except for those starting with an underscore `_`.

Props in JSX are never passed to HTML implicitly.
For example, classes must be directly applied to the inner HTML element for `<Component class={class}>`.

Basic example:

```tsx
import Layout from "./_layout.tsx";

export default () => (
  <Layout>
    <h1 id="hello-world">Hello world!</h1>
  </Layout>
);
```

#### Styling

##### CSS-in-JS with `.styled`

Styles created with `.styled` method on JSX nodes are automatically scoped and inlined into HTML.
This CSS-in-JS tranform is done at build time without client-side JS.

For example:

```tsx
const Red = () => (<span>This is red</span>).styled`
  span {
    color: red;
  }`;

const Component = () =>
  (
    <div>
      <span>This is blue</span>
      <Red />
      {(<span>This is green</span>).styled`
        span { color: green; }
      `}
    </div>
  ).styled`
  span {
    color: blue
  }`;
```

##### CSS files and CSS modules

Stylesheets can be created directly through CSS files. See [the CSS pipeline](#css-pipeline).

##### Inline styles

Inline styling can be done through the `style` attribute, which supports both HTML-like string styles and JS-like object styles.

### CSS pipeline

`.css` files are bundled and transformed with [Lightning CSS](https://lightningcss.dev).
These files must be included in pages explicitly with `<link>` tags, like you would do for an HTML file.
The CSS pipeline supports CSS modules:

```tsx
import styles from "./styles.css";

// <span class="xxxxxx_red">
const Red = ({ children }) => <span class={styles.red}>{children}</span>;
```

### MDX pipeline

`.mdx` files are built into JSX and the [JSX pipeline](#jsx-pipeline) is applied.
Custom `remark` and `rehype` plugins can be specified in [the config file](#configuration).

## JS pipeline

`.ts` and `.js` files are bundled and built into `.js` files.
These JS files must be included in pages explicitly with `<link>` tags, like you would do for an HTML file.
