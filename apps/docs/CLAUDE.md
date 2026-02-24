When writing the docs, always make sure to add it to `docs.json` for it to appear

## React Hook Documentation

**Always read the actual types** in `packages/autumn-js/src/` before writing hook docs:
- Hook params: `packages/autumn-js/src/react/hooks/<hookName>.ts`
- Client params: `packages/autumn-js/src/types/params.ts`
- SDK types: `packages/sdk/src/models/`

**Casing:** The TypeScript SDK uses camelCase (Speakeasy transforms snake_case API responses). All JSON examples in docs must use camelCase (`planId`, `createdAt`, `featureId`).

**Keep it concise:** Only document the most important parameters. Link to API reference for the full list.

## Manual API Documentation

Manual documentation (explanations, examples, use cases) should go in `api-reference-generator/` folder, NOT in `mintlify/api-reference/`. The generator merges manual content from `api-reference-generator/` with auto-generated body params and outputs the final result to `mintlify/api-reference/`.

**Workflow:**
1. Create/edit manual docs in `apps/docs/api-reference-generator/<category>/<operationId>.mdx`
2. Run the generator to merge with generated params
3. Output goes to `apps/docs/mintlify/api-reference/<category>/<operationId>.mdx`

**Never edit files directly in `mintlify/api-reference/`** - they will be overwritten by the generator.

## DynamicParamField Component

**Location:** `snippets/dynamic-param-field.jsx`

**Purpose:** Wrapper around Mintlify's `ParamField` that auto-converts param names between snake_case and camelCase based on selected code language.

**Behavior:**
- TypeScript/Node.js → camelCase (`customerId`)
- Python/cURL/others → snake_case (`customer_id`)

**How it works:**
1. Reads `code` key from localStorage (set by Mintlify's language selector)
2. Listens for `mintlify-localstorage` event + polls every 500ms as fallback
3. Transforms `body` and `path` props using regex: `str.replace(/[_-](\w)/g, ...)`

**Usage:**
```jsx
import { DynamicParamField } from "/snippets/dynamic-param-field.jsx";

<DynamicParamField body="customer_id" type="string" required>
  The customer identifier
</DynamicParamField>
```

Always pass snake_case to the component - it handles camelCase conversion automatically.