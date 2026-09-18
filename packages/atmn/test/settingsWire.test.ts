/**
 * `settings` is the one PATCH-shaped block in a PUT-shaped config: it goes to
 * its own operation, states only what it states, and reads the overlay's
 * rename on the way out. Runs the GENERATED module, like wireDocument.test.
 */

import { expect, test } from "bun:test";
import { atmn, splitWire } from "../src/generated/wire";

test("settings is recased and renamed onto the wire, PATCH-shaped", () => {
	const wire = atmn({
		features: [],
		settings: { cancelOnPastDue: true, paydownOverages: true },
		// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	}) as any;

	// Only the stated flags: nothing is filled from a default.
	expect(wire.settings).toEqual({
		cancel_on_past_due: true,
		persist_free_overage: true,
	});
});

test("an omitted settings block stays omitted: unmanaged", () => {
	// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	const wire = atmn({ features: [] }) as any;
	expect("settings" in wire).toBe(false);
	expect(splitWire(wire).singletons.settings).toBeUndefined();
});

test("splitWire cuts the singleton into its own request body", () => {
	const wire = atmn({
		features: [],
		settings: { multiCurrency: true },
	});
	const { catalog, singletons } = splitWire(wire);

	expect("settings" in catalog).toBe(false);
	expect(catalog.features).toEqual([]);
	expect(singletons.settings).toEqual({ config: { multi_currency: true } });
});
