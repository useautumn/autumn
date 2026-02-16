/**
 * Transform entity get/delete endpoints to use positional parameters
 * Replaces:
 *   autumn.entities.get('entity_id', { customer_id: 'customer_id' })
 * With:
 *   autumn.entities.get("entity_id", "customer_id")
 */
export function transformEntityEndpoints({ spec }: { spec: Record<string, unknown> }) {
	if (!spec.paths) {
		return spec;
	}

	for (const [_path, pathItem] of Object.entries(spec.paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;

		for (const [_method, operation] of Object.entries(pathItem)) {
			if (!operation || typeof operation !== "object") continue;
			if (!("x-codeSamples" in operation)) continue;

			const codeSamples = (operation as Record<string, unknown>)[
				"x-codeSamples"
			];
			if (!Array.isArray(codeSamples)) continue;

			for (const sample of codeSamples) {
				// Only transform TypeScript samples
				if (sample.lang !== "TypeScript") continue;
				if (!sample.source || typeof sample.source !== "string") continue;

				let transformed = sample.source;

				// Match: autumn.entities.get('entity_id', { customer_id: 'customer_id' })
				// Or:    autumn.entities.delete('entity_id', { customer_id: 'customer_id' })
				const entityPattern =
					/autumn\.entities\.(get|delete)\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*customer_id:\s*['"]([^'"]+)['"]\s*\}\s*\)/gi;

				transformed = transformed.replace(
					entityPattern,
					(match, method, entityId, customerId) => {
						return `autumn.entities.${method}("${entityId}", "${customerId}")`;
					},
				);

				sample.source = transformed;
			}
		}
	}

	return spec;
}



