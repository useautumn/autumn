# Agent Guidelines for shared/

## Code Organization

- Do NOT create `index.ts` files in folders. Import directly from the source file.
- For "find" or "convert" functions that may return undefined, use function overloads with `errorOnNotFound: true` to guarantee a non-undefined return type.



