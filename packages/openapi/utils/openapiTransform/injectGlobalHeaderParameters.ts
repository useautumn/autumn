const HTTP_METHODS = [
	"get",
	"put",
	"post",
	"delete",
	"patch",
	"head",
	"options",
	"trace",
] as const;

/**
 * Injects the `x-api-version` header parameter into all operations in the OpenAPI document.
 * This ensures every endpoint has the version header for SDK generation.
 * Skips operations that already have the parameter defined.
 */
export function injectGlobalHeaderParameters({
	openApiDocument,
	version = "2.1",
}: {
	openApiDocument: Record<string, unknown>;
	version?: string;
}): void {
	const xApiVersionParameter = {
		name: "x-api-version",
		in: "header",
		required: true,
		schema: {
			type: "string",
			default: version,
		},
		"x-speakeasy-globals-hidden": true,
	};

	const paths = (openApiDocument.paths ?? {}) as Record<string, unknown>;

	for (const pathItem of Object.values(paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;

		for (const method of HTTP_METHODS) {
			const operation = (pathItem as Record<string, unknown>)[method];
			if (!operation || typeof operation !== "object") continue;

			const operationRecord = operation as Record<string, unknown>;
			const parameters = Array.isArray(operationRecord.parameters)
				? [...operationRecord.parameters]
				: [];

			const hasXApiVersionParam = parameters.some((parameter) => {
				if (!parameter || typeof parameter !== "object") return false;
				const parameterRecord = parameter as Record<string, unknown>;
				return (
					parameterRecord.in === "header" &&
					parameterRecord.name === "x-api-version"
				);
			});

			if (!hasXApiVersionParam) {
				parameters.unshift(xApiVersionParameter);
			}

			operationRecord.parameters = parameters;
		}
	}
}
