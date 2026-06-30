import { expect, test } from "bun:test";
import { CatalogUpdateParamsSchema } from "@autumn/shared";
import { z } from "zod/v4";

const findObjectSchemaWithProperty = (
	schema: unknown,
	propertyName: string,
	seen = new Set<unknown>(),
): { required?: string[] } | null => {
	if (!schema || typeof schema !== "object" || seen.has(schema)) return null;
	seen.add(schema);

	const record = schema as Record<string, unknown>;
	const properties = record.properties;
	if (
		properties &&
		typeof properties === "object" &&
		propertyName in properties
	) {
		return record as { required?: string[] };
	}

	for (const value of Object.values(record)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				const found = findObjectSchemaWithProperty(item, propertyName, seen);
				if (found) return found;
			}
			continue;
		}

		const found = findObjectSchemaWithProperty(value, propertyName, seen);
		if (found) return found;
	}

	return null;
};

test("catalog MCP input schema does not require plan variants", () => {
	const inputSchema = z.object({ request: CatalogUpdateParamsSchema }).strict();
	const jsonSchema = z.toJSONSchema(inputSchema);
	const planSchema = findObjectSchemaWithProperty(jsonSchema, "variants");

	expect(planSchema).not.toBeNull();
	expect(planSchema?.required ?? []).not.toContain("variants");

	// `.default([]).optional()` must still apply the runtime default so consumers
	// can rely on `variants` being an array even though it is not `required`.
	const parsed = CatalogUpdateParamsSchema.parse({
		plans: [
			{
				plan_id: "ultra_premium",
				name: "Ultra Premium",
				group: "",
				price: {
					amount: 100,
					interval: "year",
				},
				add_on: false,
			},
		],
	});
	expect(parsed.plans[0].variants).toEqual([]);
});
