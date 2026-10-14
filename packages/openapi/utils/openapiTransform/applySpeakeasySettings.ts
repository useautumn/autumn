import { LATEST_VERSION } from "@autumn/shared";

export function applySpeakeasySettings({
	openApiDocument,
	version = LATEST_VERSION,
}: {
	openApiDocument: Record<string, unknown>;
	version?: string;
}): void {
	if (
		!openApiDocument.components ||
		typeof openApiDocument.components !== "object"
	) {
		openApiDocument.components = {};
	}

	const components = openApiDocument.components as Record<string, unknown>;

	if (
		!components.securitySchemes ||
		typeof components.securitySchemes !== "object"
	) {
		components.securitySchemes = {};
	}

	(components.securitySchemes as Record<string, unknown>).secretKey = {
		type: "http",
		scheme: "bearer",
		bearerFormat: "JWT",
	};

	openApiDocument.security = [{ secretKey: [] }];

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
			{
				name: "fail-open",
				in: "header",
				required: false,
				schema: {
					type: "boolean",
					default: true,
				},
				"x-speakeasy-globals-hidden": true,
			},
		],
	};
}
