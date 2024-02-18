# Soar

Soar is an opinionated static site generator built around JSX and filesystem routing.

## Usage

```shell
# build site
$ soar build src/

# start dev server
$ soar serve src/
```

## Basic concepts

### Filesystem routing

All `jsx`, `tsx`, and `mdx` files that do not start with an underscore `_` are treated as pages.
This means that `page.jsx` and `page/index.jsx` are built into `page/index.html`.
Pages should `export default` a JSX component.

All files in the source directory that are not `jsx`, `tsx`, or `mdx` files are copied to the output directory while maintaining their paths.

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
