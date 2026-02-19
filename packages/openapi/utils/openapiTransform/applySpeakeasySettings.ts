/**
 * Applies Speakeasy-specific settings to the OpenAPI document.
 * - Adds bearer token security scheme (`secretKey`)
 * - Sets global security requirement
 * - Configures global `x-api-version` header parameter (hidden in generated SDK)
 */
export function applySpeakeasySettings({
	openApiDocument,
	version = "2.1",
}: {
	openApiDocument: Record<string, unknown>;
	version?: string;
}): void {
	// Ensure components object exists
	if (
		!openApiDocument.components ||
		typeof openApiDocument.components !== "object"
	) {
		openApiDocument.components = {};
	}

	const components = openApiDocument.components as Record<string, unknown>;

	// Ensure securitySchemes object exists
	if (
		!components.securitySchemes ||
		typeof components.securitySchemes !== "object"
	) {
		components.securitySchemes = {};
	}

	// Add bearer token security scheme
	(components.securitySchemes as Record<string, unknown>).secretKey = {
		type: "http",
		scheme: "bearer",
		bearerFormat: "JWT",
	};

	// Set global security requirement
	openApiDocument.security = [{ secretKey: [] }];

	// Configure Speakeasy global parameters
	openApiDocument["x-speakeasy-globals"] = {
		parameters: [
			{
				name: "x-api-version",
				in: "header",
				required: true,
				schema: {
					type: "string",
					default: version,
				},
				"x-speakeasy-globals-hidden": true,
			},
		],
	};
}
