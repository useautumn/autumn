import { webhookRegistry } from "@autumn/shared";
import { config } from "dotenv";
import { Svix } from "svix";
import { createSchema } from "zod-openapi";

config({ path: "server/.env" });

const SVIX_API_KEY = process.env.SVIX_API_KEY;
if (!SVIX_API_KEY) {
	console.error("SVIX_API_KEY is not set. Provide it via env or server/.env");
	process.exit(1);
}

const svix = new Svix(SVIX_API_KEY);

async function pushEventTypes() {
	let created = 0;
	let updated = 0;
	let failed = 0;

	for (const definition of webhookRegistry) {
		const schemas = definition.schema
			? buildJsonSchemas({ definition })
			: undefined;

		const payload = {
			name: definition.eventType,
			description: definition.description,
			schemas,
			deprecated: definition.deprecated,
			archived: definition.archived,
			featureFlags: definition.featureFlags,
		};

		try {
			await svix.eventType.create(payload);
			console.log(`  [created] ${definition.eventType}`);
			created++;
		} catch (error: unknown) {
			if (isConflictError(error)) {
				try {
					const { name: _name, ...updatePayload } = payload;
					await svix.eventType.update(definition.eventType, updatePayload);
					console.log(`  [updated] ${definition.eventType}`);
					updated++;
				} catch (updateError) {
					console.error(
						`  [failed]  ${definition.eventType} — update failed:`,
						updateError,
					);
					failed++;
				}
			} else {
				console.error(
					`  [failed]  ${definition.eventType} — create failed:`,
					error,
				);
				failed++;
			}
		}
	}

	console.log(
		`\nDone: ${created} created, ${updated} updated, ${failed} failed (${webhookRegistry.length} total)`,
	);

	if (failed > 0) process.exit(1);
}

function buildJsonSchemas({
	definition,
}: {
	definition: (typeof webhookRegistry)[number];
}) {
	if (!definition.schema) return undefined;

	const { schema: jsonSchema } = createSchema(definition.schema);
	return {
		1: {
			type: "object",
			required: ["type", "data"],
			properties: {
				type: {
					type: "string",
					const: definition.eventType,
				},
				data: jsonSchema,
			},
		},
	};
}

function isConflictError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const statusCode =
		(error as Record<string, unknown>).code ??
		(error as Record<string, unknown>).statusCode ??
		(error as Record<string, unknown>).status;
	return statusCode === 409;
}

pushEventTypes();
