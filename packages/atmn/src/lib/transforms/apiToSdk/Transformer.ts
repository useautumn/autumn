/**
 * Declarative transformer system for API → SDK transformations
 *
 * Instead of writing repetitive transform functions, define transformations as config:
 * - copy: fields that pass through unchanged
 * - rename: { apiField: 'sdkField' }
 * - flatten: { 'nested.field': 'flatField' }
 * - compute: { sdkField: (api) => api.field * 2 }
 * - discriminate: conditional transforms based on a field value
 */

export interface FieldMapping<TInput = unknown> {
	/** Fields to copy as-is from API to SDK */
	copy?: string[];

	/** Rename fields: { apiFieldName: 'sdkFieldName' } */
	rename?: Record<string, string>;

	/** Flatten nested fields: { 'parent.child': 'flatName' } */
	flatten?: Record<string, string>;

	/** Remove fields from output */
	remove?: string[];

	/** Computed fields: { sdkField: (api) => computed value } */
	compute?: Record<string, (api: TInput) => unknown>;

	/** Default values for undefined/null fields: { sdkField: defaultValue } */
	defaults?: Record<string, unknown>;

	/** Transform nested arrays: { sdkField: { from: 'apiField', transform: TransformConfig } } */
	transformArrays?: Record<
		string,
		{ from: string; transform: FieldMapping<unknown> }
	>;

	/** Fields that swap null to undefined when coming from API: ['field1', 'field2'] */
	swapNullish?: string[];

	/** Fields that swap false to undefined when coming from API (only true or undefined): ['field1', 'field2'] */
	swapFalse?: string[];
}

export interface DiscriminatedTransform<TInput = unknown> {
	/** Field to discriminate on (e.g., 'type') */
	discriminator: string;

	/** Map of discriminator value → transform config */
	cases: Record<string, FieldMapping<TInput>>;

	/** Fallback transform if no case matches */
	default?: FieldMapping<TInput>;
}

/**
 * Generic transformer that applies field mappings declaratively
 */
export class Transformer<TInput = unknown, TOutput = unknown> {
	constructor(
		private config: FieldMapping<TInput> | DiscriminatedTransform<TInput>,
	) {}

	transform(input: TInput): TOutput {
		// Handle discriminated union
		if ("discriminator" in this.config) {
			return this.transformDiscriminated(input);
		}

		// Handle simple field mapping
		return this.transformFields(input, this.config);
	}

	private transformDiscriminated(input: TInput): TOutput {
		const config = this.config as DiscriminatedTransform<TInput>;
		const discriminatorValue = this.getNestedValue(
			input,
			config.discriminator,
		) as string;

		const caseConfig = config.cases[discriminatorValue] || config.default;
		if (!caseConfig) {
			throw new Error(
				`No transform case found for ${config.discriminator}="${discriminatorValue}"`,
			);
		}

		return this.transformFields(input, caseConfig);
	}

	private transformFields(
		input: TInput,
		mapping: FieldMapping<TInput>,
	): TOutput {
		const output: Record<string, unknown> = {};

		// Track which fields should swap null to undefined
		const swapNullishSet = new Set(mapping.swapNullish || []);
		// Track which fields should swap false to undefined
		const swapFalseSet = new Set(mapping.swapFalse || []);

		// Helper to safely set properties on the output object
		const safeSet = (field: string, value: unknown) => {
			if (
				field === "__proto__" ||
				field === "constructor" ||
				field === "prototype"
			) {
				return;
			}
			output[field] = value;
		};

		// 1. Copy fields
		if (mapping.copy) {
			for (const field of mapping.copy) {
				const value = this.getNestedValue(input, field);
				if (value !== undefined) {
					// If field is in swapNullish and value is null, convert to undefined
					if (swapNullishSet.has(field) && value === null) {
						// Don't set the field (undefined)
						continue;
					}
					// If field is in swapFalse and value is false, convert to undefined
					if (swapFalseSet.has(field) && value === false) {
						// Don't set the field (undefined)
						continue;
					}
					safeSet(field, value);
				}
			}
		}

		// 2. Rename fields
		if (mapping.rename) {
			for (const [apiField, sdkField] of Object.entries(mapping.rename)) {
				const value = this.getNestedValue(input, apiField);
				if (value !== undefined) {
					// If apiField is in swapNullish and value is null, convert to undefined
					if (swapNullishSet.has(apiField) && value === null) {
						// Don't set the field (undefined)
						continue;
					}
					// If apiField is in swapFalse and value is false, convert to undefined
					if (swapFalseSet.has(apiField) && value === false) {
						// Don't set the field (undefined)
						continue;
					}
					safeSet(sdkField, value);
				}
			}
		}

		// 3. Flatten nested fields
		if (mapping.flatten) {
			for (const [nestedPath, flatName] of Object.entries(mapping.flatten)) {
				const value = this.getNestedValue(input, nestedPath);
				if (value !== undefined) {
					// If nestedPath is in swapNullish and value is null, convert to undefined
					if (swapNullishSet.has(nestedPath) && value === null) {
						// Don't set the field (undefined)
						continue;
					}
					// If nestedPath is in swapFalse and value is false, convert to undefined
					if (swapFalseSet.has(nestedPath) && value === false) {
						// Don't set the field (undefined)
						continue;
					}
					safeSet(flatName, value);
				}
			}
		}

		// 4. Compute fields
		if (mapping.compute) {
			for (const [sdkField, computeFn] of Object.entries(mapping.compute)) {
				const value = computeFn(input);
				if (value !== undefined) {
					safeSet(sdkField, value);
				}
			}
		}

		// 5. Transform arrays
		if (mapping.transformArrays) {
			for (const [sdkField, config] of Object.entries(
				mapping.transformArrays,
			)) {
				const apiArray = this.getNestedValue(input, config.from);
				if (Array.isArray(apiArray)) {
					const transformer = new Transformer(config.transform);
					safeSet(
						sdkField,
						apiArray.map((item) => transformer.transform(item)),
					);
				}
			}
		}

		// 6. Apply defaults
		if (mapping.defaults) {
			for (const [field, defaultValue] of Object.entries(mapping.defaults)) {
				if (output[field] === undefined || output[field] === null) {
					safeSet(field, defaultValue);
				}
			}
		}

		return output as TOutput;
	}

	/**
	 * Get nested value using dot notation (e.g., 'reset.interval')
	 */
	private getNestedValue(obj: unknown, path: string): unknown {
		const parts = path.split(".");
		let value: unknown = obj;

		for (const part of parts) {
			if (value === null || value === undefined) {
				return undefined;
			}
			if (
				part === "__proto__" ||
				part === "constructor" ||
				part === "prototype"
			) {
				return undefined;
			}
			value = (value as Record<string, unknown>)[part];
		}

		return value;
	}

}

/**
 * Helper to create a transformer with type safety
 */
export function createTransformer<TInput, TOutput>(
	config: FieldMapping<TInput> | DiscriminatedTransform<TInput>,
): Transformer<TInput, TOutput> {
	return new Transformer<TInput, TOutput>(config);
}
