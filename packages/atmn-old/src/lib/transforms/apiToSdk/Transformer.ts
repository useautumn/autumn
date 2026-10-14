export interface FieldMapping<TInput = unknown> {
	copy?: string[];

	rename?: Record<string, string>;

	flatten?: Record<string, string>;

	remove?: string[];

	compute?: Record<string, (api: TInput) => unknown>;

	defaults?: Record<string, unknown>;

	transformArrays?: Record<
		string,
		{ from: string; transform: FieldMapping<unknown> }
	>;

	swapNullish?: string[];

	swapFalse?: string[];
}

export interface DiscriminatedTransform<TInput = unknown> {
	discriminator: string;

	cases: Record<string, FieldMapping<TInput>>;

	default?: FieldMapping<TInput>;
}

export class Transformer<TInput = unknown, TOutput = unknown> {
	constructor(
		private config: FieldMapping<TInput> | DiscriminatedTransform<TInput>,
	) {}

	transform(input: TInput): TOutput {
		if ("discriminator" in this.config) {
			return this.transformDiscriminated(input);
		}

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

		const swapNullishSet = new Set(mapping.swapNullish || []);
		const swapFalseSet = new Set(mapping.swapFalse || []);

		if (mapping.copy) {
			for (const field of mapping.copy) {
				const value = this.getNestedValue(input, field);
				if (value !== undefined) {
					if (swapNullishSet.has(field) && value === null) {
						continue;
					}
					if (swapFalseSet.has(field) && value === false) {
						continue;
					}
					output[field] = value;
				}
			}
		}

		if (mapping.rename) {
			for (const [apiField, sdkField] of Object.entries(mapping.rename)) {
				const value = this.getNestedValue(input, apiField);
				if (value !== undefined) {
					if (swapNullishSet.has(apiField) && value === null) {
						continue;
					}
					if (swapFalseSet.has(apiField) && value === false) {
						continue;
					}
					output[sdkField] = value;
				}
			}
		}

		if (mapping.flatten) {
			for (const [nestedPath, flatName] of Object.entries(mapping.flatten)) {
				const value = this.getNestedValue(input, nestedPath);
				if (value !== undefined) {
					if (swapNullishSet.has(nestedPath) && value === null) {
						continue;
					}
					if (swapFalseSet.has(nestedPath) && value === false) {
						continue;
					}
					output[flatName] = value;
				}
			}
		}

		if (mapping.compute) {
			for (const [sdkField, computeFn] of Object.entries(mapping.compute)) {
				const value = computeFn(input);
				if (value !== undefined) {
					output[sdkField] = value;
				}
			}
		}

		if (mapping.transformArrays) {
			for (const [sdkField, config] of Object.entries(
				mapping.transformArrays,
			)) {
				const apiArray = this.getNestedValue(input, config.from);
				if (Array.isArray(apiArray)) {
					const transformer = new Transformer(config.transform);
					output[sdkField] = apiArray.map((item) =>
						transformer.transform(item),
					);
				}
			}
		}

		if (mapping.defaults) {
			for (const [field, defaultValue] of Object.entries(mapping.defaults)) {
				if (output[field] === undefined || output[field] === null) {
					output[field] = defaultValue;
				}
			}
		}

		return output as TOutput;
	}

	private getNestedValue(obj: unknown, path: string): unknown {
		const parts = path.split(".");
		let value: unknown = obj;

		for (const part of parts) {
			if (value === null || value === undefined) {
				return undefined;
			}
			value = (value as Record<string, unknown>)[part];
		}

		return value;
	}
}

export function createTransformer<TInput, TOutput>(
	config: FieldMapping<TInput> | DiscriminatedTransform<TInput>,
): Transformer<TInput, TOutput> {
	return new Transformer<TInput, TOutput>(config);
}
