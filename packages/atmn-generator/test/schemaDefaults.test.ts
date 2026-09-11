import { expect, test } from "bun:test";
import { withOverlayDefaults } from "../src/emit/emitEmitModule";
import { schemaDefaults } from "../src/fuzz/schemaPaths";
import { OVERLAY } from "../src/overlay/overlay";
import { catalogUpdateSchema, loadSpec } from "../src/spec/loadSpec";

const spec = loadSpec();
const specDefaults = schemaDefaults({
	schema: catalogUpdateSchema({ spec }),
	root: spec as never,
	overlay: OVERLAY,
});
const defaults = withOverlayDefaults({ specDefaults, overlay: OVERLAY });

test("spec defaults are keyed fixture-side, from the catalog root", () => {
	expect(defaults.get("plans.config.ignorePastDue")).toBe(false);
	expect(defaults.get("plans.addOn")).toBe(false);
	expect(defaults.get("plans.metadata")).toEqual({});
	expect(defaults.get("plans.billingControls.usageLimits")).toEqual([]);
	expect(defaults.get("plans.billingControls.usageLimits.enabled")).toBe(true);
	expect(defaults.get("plans.freeTrial.onEnd")).toBe("bill");
});

test("a path without a spec default is absent, so an empty items array is never elided", () => {
	expect(defaults.has("plans.items")).toBe(false);
	expect(defaults.has("plans.versionSlug")).toBe(false);
	// A classic credit system must state its schema, even as [].
	expect(defaults.has("features.creditSchema")).toBe(false);
});

test("a hidden path carries no default", () => {
	expect(defaults.has("plans.isDefault")).toBe(false);
	expect(defaults.has("features.display")).toBe(false);
});

test("overlay defaults land in the emitted fixture paths", () => {
	expect(defaults.get("plans.items.unlimited")).toBe(false);
	expect(defaults.get("plans.licenses.customize.addItems.unlimited")).toBe(
		false,
	);
	expect(defaults.get("plans.variants.customize.items.unlimited")).toBe(false);
	expect(defaults.get("plans.variants.customize.addItems.unlimited")).toBe(
		false,
	);
	expect(
		defaults.get(
			"plans.variants.customize.upsertLicenses.customize.addItems.unlimited",
		),
	).toBe(false);
});
