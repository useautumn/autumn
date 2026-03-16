# API → SDK Transform Layer

This directory contains transforms that convert Autumn API responses to SDK configuration types.

## Declarative Transformer System

Instead of writing repetitive imperative transform functions, we use a **declarative configuration system** that dramatically reduces code and improves maintainability.

### Quick Example

**Instead of this (79 lines):**
```typescript
export function transformApiFeature(apiFeature: any): Feature {
	const base = {
		id: apiFeature.id,
		name: apiFeature.name,
		event_names: apiFeature.event_names,
		credit_schema: apiFeature.credit_schema,
	};

	if (apiFeature.type === "boolean") {
		return { ...base, type: "boolean" as const };
	}

	if (apiFeature.type === "single_use") {
		return {
			...base,
			type: "metered" as const,
			consumable: true,
		};
	}
	// ... 50+ more lines
}
```

**We write this (40 lines):**
```typescript
export const featureTransformer = createTransformer<any, Feature>({
	discriminator: 'type',
	cases: {
		'boolean': {
			copy: ['id', 'name', 'event_names', 'credit_schema'],
			compute: { type: () => 'boolean' as const },
		},
		'single_use': {
			copy: ['id', 'name', 'event_names', 'credit_schema'],
			compute: {
				type: () => 'metered' as const,
				consumable: () => true,
			},
		},
		// ... more cases
	},
});

export function transformApiFeature(apiFeature: any): Feature {
	return featureTransformer.transform(apiFeature);
}
```

## Transformer API

```typescript
createTransformer<Input, Output>({
  // Copy fields as-is
  copy: ['id', 'name', 'description'],
  
  // Rename fields
  rename: { 
    'default': 'auto_enable',
    'granted_balance': 'included',
  },
  
  // Flatten nested fields
  flatten: {
    'reset.interval': 'interval',
    'reset.interval_count': 'interval_count',
  },
  
  // Compute new values
  compute: {
    carry_over_usage: (api) => !api.reset?.reset_when_enabled,
    type: () => 'metered' as const,
  },
  
  // Default values for missing fields
  defaults: {
    credit_schema: [],
    enabled: true,
  },
  
  // Transform nested arrays
  transformArrays: {
    features: {
      from: 'features',
      transform: planFeatureTransformer.config
    }
  },
})
```

### Discriminated Unions

For types that switch behavior based on a field (like `type`):

```typescript
createTransformer({
  discriminator: 'type',  // Field to switch on
  cases: {
    'boolean': { /* config for boolean */ },
    'metered': { /* config for metered */ },
    'credit_system': { /* config for credit */ },
  },
  default: { /* fallback config */ },
})
```

## Benefits

1. **Self-documenting** - Config clearly shows what transforms happen
2. **DRY** - No repetitive field copying boilerplate
3. **Type-safe** - Generic input/output types
4. **Testable** - Test engine once, not each transform
5. **Composable** - Reuse configs across transforms
6. **58% less code** - 213 lines → 90 lines + reusable engine

## Files

- `Transformer.ts` - Core declarative transformer engine
- `feature.ts` - Feature transforms (API → SDK)
- `plan.ts` - Plan transforms (API → SDK)
- `planFeature.ts` - Plan feature transforms (API → SDK)
- `helpers.ts` - Helper functions (invert, map enums, etc.)
- `Transformer.test.ts` - Comprehensive test suite

## Transform Mappings

### Feature
- `type: "single_use"` → `type: "metered", consumable: true`
- `type: "continuous_use"` → `type: "metered", consumable: false`
- `type: "credit_system"` → `type: "credit_system", consumable: true`
- `type: "boolean"` → `type: "boolean"` (no consumable field)

### Plan
- `default` → `auto_enable`
- Copy: `id`, `name`, `description`, `group`, `add_on`, `free_trial`
- Transform: `price`, `features[]`

### Plan Feature
- `granted_balance` → `included`
- `reset.interval` → `interval` (flatten)
- `reset.interval_count` → `interval_count` (flatten)
- `reset.reset_when_enabled` → `carry_over_usage` (flatten + invert)
- `price.usage_model` → `price.billing_method` (rename)

## Testing

```bash
bun test src/lib/transforms/apiToSdk/Transformer.test.ts
```

All transforms are thoroughly tested to ensure correct behavior.
