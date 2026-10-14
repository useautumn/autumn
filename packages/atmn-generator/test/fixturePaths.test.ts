import { expect, test } from "bun:test";
import type { JsonSchema } from "../src/casing/schemaKeyCasing";
import { schemaPaths } from "../src/fuzz/schemaPaths";
import { OVERLAY } from "../src/overlay/overlay";
import { catalogUpdateSchema, loadSpec } from "../src/spec/loadSpec";

const collectionPaths = ({
	schema,
	collection,
}: {
	schema: Map<string, Set<string>>;
	collection: string;
}): string[] => {
	const prefix = `${collection}.`;
	return [...schema.keys()]
		.filter((path) => path.startsWith(prefix))
		.map((path) => path.slice(prefix.length))
		.sort();
};

const spec = loadSpec();
const root = spec as unknown as JsonSchema;
const realSchema = schemaPaths({
	schema: catalogUpdateSchema({ spec }),
	root,
	overlay: OVERLAY,
});
const plansPaths = collectionPaths({ schema: realSchema, collection: "plans" });

test("plans paths carry the fields a config may state", () => {
	expect(plansPaths).toContain("items");
	expect(plansPaths).toContain("items.price.tiers.to");
	expect(plansPaths).toContain("licenses.included");
	expect(plansPaths).toContain("billingControls");
});

test("plans paths exclude server-only and overlay-hidden fields", () => {
	expect(plansPaths).not.toContain("items.entitlementId");
	expect(plansPaths).not.toContain("items.priceId");
	expect(plansPaths).not.toContain("versioning");
	expect(plansPaths).not.toContain("version");
});
