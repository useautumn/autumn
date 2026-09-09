import { expect, test } from "bun:test";
import { fixtureDefaults } from "../src/emit/fixtureDefaults";
import type { Overlay } from "../src/overlay/overlay";
import { OVERLAY } from "../src/overlay/overlay";
import { collectionItemSchema, loadSpec } from "../src/spec/loadSpec";

const spec = loadSpec();
const root = spec as never;

test("plans.config reads as its spec defaults, fixture-cased", () => {
	expect(
		fixtureDefaults({
			schema: collectionItemSchema({ spec, collection: "plans" }),
			root,
			overlay: OVERLAY,
			collection: "plans",
		}),
	).toEqual([{ path: "config", default: { ignorePastDue: false } }]);
});

test("a collection without the verb emits no defaults", () => {
	expect(
		fixtureDefaults({
			schema: collectionItemSchema({ spec, collection: "features" }),
			root,
			overlay: OVERLAY,
			collection: "features",
		}),
	).toEqual([]);
});

test("an object with a child lacking a spec default is refused at generate time", () => {
	const overlay: Overlay = {
		exposeInternal: [],
		collections: {
			plans: {
				billing_controls: { omitWhenDefault: true, reason: "test" },
			},
		},
	};
	expect(() =>
		fixtureDefaults({
			schema: collectionItemSchema({ spec, collection: "plans" }),
			root,
			overlay,
			collection: "plans",
		}),
	).toThrow(/has no spec default/);
});

test("a non-object path is refused at generate time", () => {
	const overlay: Overlay = {
		exposeInternal: [],
		collections: { plans: { name: { omitWhenDefault: true, reason: "test" } } },
	};
	expect(() =>
		fixtureDefaults({
			schema: collectionItemSchema({ spec, collection: "plans" }),
			root,
			overlay,
			collection: "plans",
		}),
	).toThrow(/is not an object/);
});

test("a nested path is refused at generate time", () => {
	const overlay: Overlay = {
		exposeInternal: [],
		collections: {
			plans: {
				"free_trial.card_required": { omitWhenDefault: true, reason: "test" },
			},
		},
	};
	expect(() =>
		fixtureDefaults({
			schema: collectionItemSchema({ spec, collection: "plans" }),
			root,
			overlay,
			collection: "plans",
		}),
	).toThrow(/only a top-level object/);
});

test("a child stated through a $ref still reads its default", () => {
	const overlay: Overlay = {
		exposeInternal: [],
		collections: {
			plans: { config: { omitWhenDefault: true, reason: "test" } },
		},
	};
	const schema = {
		type: "object",
		properties: {
			config: {
				type: "object",
				properties: { flag: { $ref: "#/components/schemas/Flag" } },
			},
		},
	};
	const refRoot = {
		components: { schemas: { Flag: { type: "boolean", default: false } } },
	} as never;
	expect(
		fixtureDefaults({ schema, root: refRoot, overlay, collection: "plans" }),
	).toEqual([{ path: "config", default: { flag: false } }]);
});
