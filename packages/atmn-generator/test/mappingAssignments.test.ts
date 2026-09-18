import { expect, test } from "bun:test";
import {
	catalogPlanItemIdentity,
	evaluateCatalogItemIdentity,
} from "../../../shared/api/catalogV2/planUpdate/params/catalogPlanItemIdentity";
import type { JsonSchema } from "../src/casing/schemaKeyCasing";
import { mappingProjection } from "../src/emit/mappingProjection";
import {
	type MappingIdentity,
	type MappingProjection,
	mappingAssignments,
	mappingIdentityOf,
} from "../src/emit/runtime/mappingAssignments";
import { OVERLAY } from "../src/overlay/overlay";
import { collectionItemSchema, loadSpec } from "../src/spec/loadSpec";

const identity: MappingIdentity = {
	responseField: "mappingIdentity",
	components: [
		{ paths: ["featureId"], default: "" },
		{ paths: ["price.billingMethod"], default: "" },
		{ paths: ["price.interval", "reset.interval"], default: "" },
		{
			paths: ["price.intervalCount", "reset.intervalCount"],
			default: "",
			defaultWhen: { component: 2, value: 1 },
		},
	],
};
const projection: MappingProjection = {
	properties: {
		processors: { mapping: true },
		items: {
			identity,
			items: {
				properties: {
					price: { properties: { processors: { mapping: true } } },
				},
			},
		},
	},
};

const item = (interval: string) => ({
	featureId: "seats",
	price: { billingMethod: "prepaid", interval },
});
const remoteItem = (interval: string) => {
	const value = item(interval);
	return {
		...value,
		mappingIdentity: mappingIdentityOf({ value, identity }),
		price: {
			...value.price,
			processors: { stripe: { priceId: `price_${interval}` } },
		},
	};
};

test("internal schema generates every existing catalog mapping location", () => {
	const spec = loadSpec();
	const plans = mappingProjection({
		schema: collectionItemSchema({ spec, collection: "plans" }),
		root: spec as JsonSchema,
		overlay: OVERLAY,
		collection: "plans",
	});
	expect(plans?.properties?.processors?.mapping).toBe(true);
	expect(plans?.properties?.price?.properties?.processors?.mapping).toBe(true);
	expect(
		plans?.properties?.items?.items?.properties?.price?.properties?.processors
			?.mapping,
	).toBe(true);
	expect(plans?.properties?.items?.identity).toEqual(identity);
	expect(
		plans?.properties?.variants?.items?.properties?.processors?.sourcePath,
	).toEqual(["plan", "processors"]);
	const features = mappingProjection({
		schema: collectionItemSchema({ spec, collection: "features" }),
		root: spec as JsonSchema,
		overlay: OVERLAY,
		collection: "features",
	});
	expect(features?.properties?.processors?.mapping).toBe(true);
});

test("mapping assignments follow generated identity, not remote array order", () => {
	const result = mappingAssignments({
		projection,
		local: { items: [item("year"), item("month")] },
		remote: { items: [remoteItem("month"), remoteItem("year")] },
	});
	expect(result.errors).toEqual([]);
	expect(result.assignments).toEqual([
		{
			path: ["items", 0, "price", "processors"],
			text: JSON.stringify({ stripe: { priceId: "price_year" } }),
		},
		{
			path: ["items", 1, "price", "processors"],
			text: JSON.stringify({ stripe: { priceId: "price_month" } }),
		},
	]);
});

test("identity normalizes omitted interval count and uses reset cadence", () => {
	expect(mappingIdentityOf({ value: item("month"), identity })).toBe(
		'["seats","prepaid","month",1]',
	);
	expect(
		mappingIdentityOf({
			value: { featureId: "seats", reset: { interval: "month" } },
			identity,
		}),
	).toBe('["seats","","month",1]');
	expect(mappingIdentityOf({ value: { featureId: "seats" }, identity })).toBe(
		'["seats","","",""]',
	);
});

test("generated and server identity evaluation agree on all cadence defaults", () => {
	for (const interval of [undefined, null, "month", "year", "one_off", ""]) {
		for (const intervalCount of [undefined, null, 1, 3]) {
			for (const billingMethod of [undefined, null, "prepaid", "usage_based"]) {
				const wire = {
					feature_id: 'seats|quoted"',
					price: {
						billing_method: billingMethod,
						interval,
						interval_count: intervalCount,
					},
					reset: { interval: "month", interval_count: 2 },
				};
				const fixture = {
					featureId: wire.feature_id,
					price: { billingMethod, interval, intervalCount },
					reset: { interval: "month", intervalCount: 2 },
				};
				expect(mappingIdentityOf({ value: fixture, identity })).toBe(
					JSON.stringify(
						evaluateCatalogItemIdentity({
							item: wire,
							recipe: catalogPlanItemIdentity,
						}),
					),
				);
			}
		}
	}
});

test("ambiguous or computed identities are refused", () => {
	for (const items of [
		[item("month"), item("month")],
		[{ featureId: Symbol("computed") }],
	]) {
		const result = mappingAssignments({
			projection,
			local: { items },
			remote: { items: [remoteItem("month")] },
		});
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.assignments).toEqual([]);
	}
	const duplicateRemote = mappingAssignments({
		projection,
		local: { items: [item("month")] },
		remote: { items: [remoteItem("month"), remoteItem("month")] },
	});
	expect(duplicateRemote.errors).toHaveLength(1);
});

test("missing server identity is reported rather than guessing", () => {
	const { mappingIdentity: _, ...remote } = remoteItem("month");
	const result = mappingAssignments({
		projection,
		local: { items: [item("month")] },
		remote: { items: [remote] },
	});
	expect(result.errors).toHaveLength(1);
});

test("mapping splices never invent an incomplete price container", () => {
	const priceProjection = {
		properties: { price: { properties: { processors: { mapping: true } } } },
	};
	const result = mappingAssignments({
		projection: priceProjection,
		local: {},
		remote: { price: { processors: { stripe: { priceId: "price_123" } } } },
	});
	expect(result.assignments).toEqual([]);
	expect(result.errors).toEqual([
		"price: mapping container is not stated in the fixture",
	]);
});

test("authoritative mapping projection removes mappings the server no longer returns", () => {
	const result = mappingAssignments({
		projection,
		local: { processors: { stripe: { productId: "prod_old" } } },
		remote: {},
	});
	expect(result.errors).toEqual([]);
	expect(result.assignments).toEqual([{ path: ["processors"], text: null }]);
});

test("projection discovery uses schema annotations for arbitrary field names", () => {
	const schema: JsonSchema = {
		type: "object",
		properties: {
			entries: {
				type: "array",
				items: {
					type: "object",
					"x-atmn-identity": {
						responseField: "remote_identity",
						components: [{ paths: ["external_name"], default: "" }],
					},
					properties: {
						external_name: { type: "string" },
						connection: {
							type: "object",
							"x-atmn-mapping": true,
							"x-atmn-source-path": "resolved.connection",
							properties: { provider_id: { type: "string" } },
						},
					},
				},
			},
		},
	};
	const discovered = mappingProjection({
		schema,
		root: schema,
		overlay: { collections: {}, exposeInternal: [], serverOwnedInternal: {} },
		collection: "examples",
	});
	expect(discovered).toEqual({
		properties: {
			entries: {
				identity: {
					responseField: "remoteIdentity",
					components: [{ paths: ["externalName"], default: "" }],
				},
				items: {
					properties: {
						connection: {
							mapping: true,
							sourcePath: ["resolved", "connection"],
						},
					},
				},
			},
		},
	});
	if (!discovered) throw new Error("Missing generated mapping projection");
	const result = mappingAssignments({
		projection: discovered,
		local: { entries: [{ externalName: "example" }] },
		remote: {
			entries: [
				{
					remoteIdentity: '["example"]',
					resolved: { connection: { providerId: "provider_123" } },
				},
			],
		},
	});
	expect(result.assignments[0]).toEqual({
		path: ["entries", 0, "connection"],
		text: '{"providerId":"provider_123"}',
	});
});

test("renamed fixture properties retain their server mapping source", () => {
	const schema: JsonSchema = {
		type: "object",
		properties: { wire_name: { type: "object", "x-atmn-mapping": true } },
	};
	const discovered = mappingProjection({
		schema,
		root: schema,
		collection: "examples",
		overlay: {
			collections: {
				examples: {
					wire_name: {
						rename: "customName",
						reason: "Synthetic overlay coverage",
					},
				},
			},
			exposeInternal: [],
			serverOwnedInternal: {},
		},
	});
	if (!discovered) throw new Error("Missing generated mapping projection");
	expect(
		mappingAssignments({
			projection: discovered,
			local: {},
			remote: { wireName: { providerId: "provider_123" } },
		}).assignments,
	).toEqual([{ path: ["customName"], text: '{"providerId":"provider_123"}' }]);
});
