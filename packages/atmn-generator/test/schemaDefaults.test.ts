import { expect, test } from "bun:test";
import { schemaDefaults } from "../src/fuzz/schemaPaths";
import { OVERLAY } from "../src/overlay/overlay";
import { catalogUpdateSchema, loadSpec } from "../src/spec/loadSpec";

const spec = loadSpec();
const defaults = schemaDefaults({
	schema: catalogUpdateSchema({ spec }),
	root: spec as never,
	overlay: OVERLAY,
});

test("spec defaults are keyed fixture-side, from the catalog root", () => {
	expect(defaults.get("plans.config.ignorePastDue")).toBe(false);
	expect(defaults.get("plans.addOn")).toBe(false);
	expect(defaults.get("plans.metadata")).toEqual({});
	expect(defaults.get("plans.billingControls.usageLimits")).toEqual([]);
	expect(defaults.get("plans.billingControls.usageLimits.enabled")).toBe(true);
	expect(defaults.get("plans.freeTrial.onEnd")).toBe("bill");
	expect(defaults.get("features.creditSchema")).toEqual([]);
});

test("a path without a spec default is absent, so an empty items array is never elided", () => {
	expect(defaults.has("plans.items")).toBe(false);
	expect(defaults.has("plans.versionSlug")).toBe(false);
});

test("a hidden path carries no default", () => {
	expect(defaults.has("plans.isDefault")).toBe(false);
	expect(defaults.has("features.display")).toBe(false);
});
