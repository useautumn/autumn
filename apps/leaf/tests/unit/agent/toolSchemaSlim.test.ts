/**
 * The model-facing tool schema hides `customize.items` (PUT-style, replaces
 * every plan item) and keeps the PATCH-style `add_items` / `remove_items`.
 * A Slack attach on 2026-09-14 used `items` to "override emails" and dropped
 * every other Enterprise entitlement; the model never needs the PUT form.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod/v4";

const { AttachParamsV1Schema, CreateScheduleParamsV0Schema } = await import(
	"@autumn/shared"
);
const { slimToolSchema } = await import("../../../agent/lib/toolSchemaSlim.js");

type Schema = Record<string, unknown>;
type JsonSchemaObject = Parameters<typeof slimToolSchema>[0];

const toModelSchema = (schema: z.ZodType) =>
	slimToolSchema(
		z.toJSONSchema(schema, {
			io: "input",
			unrepresentable: "any",
		}) as JsonSchemaObject,
	) as Schema;

const propertyNamesAt = (schema: Schema, path: string[]): string[] => {
	const target = path.reduce<unknown>(
		(node, key) => (node as Schema | undefined)?.[key],
		schema,
	);
	return Object.keys(((target as Schema)?.properties as Schema) ?? {});
};

/** Every `customize`-shaped object reachable in the schema, however nested. */
const customizeShapes = (node: unknown, found: Schema[] = []): Schema[] => {
	if (Array.isArray(node)) {
		for (const entry of node) customizeShapes(entry, found);
		return found;
	}
	if (!node || typeof node !== "object") return found;
	const properties = (node as Schema).properties as Schema | undefined;
	if (properties && "add_items" in properties && "remove_items" in properties) {
		found.push(properties);
	}
	for (const value of Object.values(node as Schema)) {
		customizeShapes(value, found);
	}
	return found;
};

describe("slimToolSchema customize", () => {
	test("hides PUT-style items on attach and keeps the patch keys", () => {
		const names = propertyNamesAt(toModelSchema(AttachParamsV1Schema), [
			"properties",
			"customize",
		]);
		expect(names).not.toContain("items");
		expect(names).toEqual(
			expect.arrayContaining(["price", "add_items", "remove_items"]),
		);
	});

	test("hides items on every nested customize, e.g. schedule phases", () => {
		const shapes = customizeShapes(toModelSchema(CreateScheduleParamsV0Schema));
		expect(shapes.length).toBeGreaterThan(0);
		for (const shape of shapes) {
			expect(Object.keys(shape)).not.toContain("items");
		}
	});

	test("leaves an unrelated `items` property alone", () => {
		const slim = slimToolSchema({
			type: "object",
			properties: {
				items: { type: "array", items: { type: "string" } },
				name: { type: "string" },
			},
		}) as Schema;
		expect(propertyNamesAt(slim, [])).toEqual(["items", "name"]);
	});
});
