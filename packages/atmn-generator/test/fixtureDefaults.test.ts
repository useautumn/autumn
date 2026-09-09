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
