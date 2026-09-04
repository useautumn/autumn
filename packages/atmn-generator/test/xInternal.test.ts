/**
 * `x-internal: true` fields are the server's, never the config's. The
 * generator skips them everywhere unless the overlay exposes one by name.
 */

import { expect, test } from "bun:test";
import type { JsonSchema } from "../src/casing/schemaKeyCasing";
import { typeExpression } from "../src/emit/emitType";
import { nodeRulesFromSpec } from "../src/lint/specRules/nodeRulesFromSpec";
import type { Overlay } from "../src/overlay/overlay";
import { fieldsAtPath } from "../src/spec/fieldsAtPath";
import { catalogUpdateSchema, loadSpec } from "../src/spec/loadSpec";

const spec = loadSpec();
const root = spec as unknown as JsonSchema;
const envelope = catalogUpdateSchema({ spec });

test("the real spec: server-owned ids vanish, the Stripe mapping survives", () => {
	const item = fieldsAtPath({ schema: envelope, root, path: "plans.items" });
	for (const serverOwned of ["priceId", "entitlementId", "entityFeatureId"]) {
		expect(item?.has(serverOwned)).toBe(false);
	}
	expect(
		fieldsAtPath({ schema: envelope, root, path: "plans.price" })?.has(
			"stripePriceId",
		),
	).toBe(false);
	// `processors.stripe.priceId` is a mapping the user may write, not a DB id.
	expect(
		fieldsAtPath({
			schema: envelope,
			root,
			path: "plans.items.price.processors.stripe",
		})?.has("priceId"),
	).toBe(true);
	// An x-internal subtree is not descended into at all.
	expect(
		fieldsAtPath({
			schema: envelope,
			root,
			path: "plans.variants.customize.updateItems",
		}),
	).toBeUndefined();
});

const withInternal: JsonSchema = {
	type: "object",
	properties: {
		things: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					secret: { type: "string", minLength: 1, "x-internal": true },
				},
				required: ["id", "secret"],
			},
		},
	},
};

const overlayExposing = (names: string[]): Overlay => ({
	collections: {},
	exposeInternal: names,
});

test("a synthetic x-internal field is skipped by type, lint and path lookup", () => {
	const overlay = overlayExposing([]);
	const type = typeExpression({
		schema: withInternal.properties?.things?.items as JsonSchema,
		path: "",
		context: { overlay, collection: "things" },
	});
	expect(type).not.toContain("secret");

	const rules = nodeRulesFromSpec({ schema: withInternal, root: {}, overlay });
	expect(rules.things?.required).toEqual(["id"]);
	expect(rules.things?.fields?.secret).toBeUndefined();

	expect(
		fieldsAtPath({ schema: withInternal, root: {}, path: "things", overlay }),
	).toEqual(new Set(["id"]));
});

test("exposeInternal lets a named field back through everywhere", () => {
	const overlay = overlayExposing(["secret"]);
	const type = typeExpression({
		schema: withInternal.properties?.things?.items as JsonSchema,
		path: "",
		context: { overlay, collection: "things" },
	});
	expect(type).toContain("secret");

	const rules = nodeRulesFromSpec({ schema: withInternal, root: {}, overlay });
	expect(rules.things?.required).toEqual(["id", "secret"]);
	expect(rules.things?.fields?.secret?.minLength).toBe(1);

	expect(
		fieldsAtPath({ schema: withInternal, root: {}, path: "things", overlay }),
	).toEqual(new Set(["id", "secret"]));
});
