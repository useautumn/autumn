When writing the docs, always make sure to add it to `docs.json` for it to appear

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