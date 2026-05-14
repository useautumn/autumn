import { createSchema } from "zod-openapi";
import { z } from "zod/v4";
import { webhookRegistry } from "./webhookDefinitions.js";

/**
 * Injects OpenAPI `webhooks` entries and their component schemas into the
 * generated OpenAPI document. Only definitions with a Zod schema are included;
 * schema-less entries (description-only) are skipped.
 */
export function injectWebhooks({
	openApiDocument,
}: {
	openApiDocument: Record<string, unknown>;
}) {
	const webhooks: Record<string, unknown> = {};

	const components = (openApiDocument.components ?? {}) as Record<
		string,
		unknown
	>;
	const existingSchemas = (components.schemas ?? {}) as Record<string, unknown>;

	for (const definition of webhookRegistry) {
		if (!definition.schema) continue;

		const { schema: jsonSchema, components: schemaComponents } = createSchema(
			definition.schema,
		);

		for (const [name, schemaObj] of Object.entries(schemaComponents)) {
			existingSchemas[name] = schemaObj;
		}

		const meta = z.globalRegistry.get(definition.schema);
		const schemaExample = meta?.examples?.[0] as
			| Record<string, unknown>
			| undefined;

		webhooks[definition.eventType] = {
			post: {
				operationId: definition.operationId,
				summary: definition.title,
				description: definition.description,
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["type", "data"],
								properties: {
									type: {
										type: "string",
										const: definition.eventType,
										description: "The webhook event type.",
									},
									data: jsonSchema,
								},
							},
							...(schemaExample && {
								example: {
									type: definition.eventType,
									data: schemaExample,
								},
							}),
						},
					},
				},
				responses: {
					"200": {
						description: "Webhook received successfully.",
					},
				},
			},
		};
	}

	components.schemas = existingSchemas;
	openApiDocument.components = components;
	openApiDocument.webhooks = webhooks;
}
