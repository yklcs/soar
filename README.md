# Soar

Soar is a minimal opinionated static site generator built around JSX and filesystem routing.

It provides an opinionated core with extensibility.

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

## Basic concepts

### ES modules and custom import hooks

Soar is built around ES modules with [Node's custom import hooks](https://nodejs.org/api/module.html#customization-hooks).
This means that TypeScript, JSX, and MDX files can be used with an `import` statement like any other file.

Additional import hooks can be specified with the `importHooks` option in the configuration file.

### Configuration

Soar does not need a config file for most things, but can be provided with one.
The default export of `Soar.ts` (with capitalization) in the source directory will be used.
See [config.ts](./src/config.ts) for available options.

### Filesystem routing

The file tree within the source directory is used for building the output site.
This means all routing will be done

All `jsx`, `tsx`, and `mdx` files that do not start with an underscore `_` are treated as pages.
This means that `page.jsx` and `page/index.jsx` are built into `page/index.html`.
Pages should `export default` a JSX component.

All files in the source directory that are not `jsx`, `tsx`, or `mdx` files are copied to the output directory while maintaining their paths.

### Programmatic pages

`create()` is exported from `soar` and can be used to programatically create a page.

### Styling

Styling is performed through the `.styled` method on JSX nodes. For example:

```tsx
const BlueText = ({ children }) => (<span>{children}</span>).styled`
  span {
    color: blue
  }
`;
```

Styles are automatically scoped.

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

### Pipeline

Soar works with a pipeline.
A pipeline takes an input file path as argument and returns `Action[]`s.

1. `import` with custom import hook
2. Run pipeline on imported result
3. Build or serve result

```ts
const { default: page } = await import("page.tsx")
const html = pipeline(page)
write(html)
```

The result of a pipeline is `Action[]`, where `Action` represents an atomic transaction modifying the site state.

```ts
interface Action {
  type: "create" | "delete" | "update",
  target: string
  data: string
}
```

### Creating pages programatically

You can create pages programatically with `create`.
