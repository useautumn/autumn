import { afterEach, expect, test } from "bun:test";
import { AB_EXPERIMENT } from "../../../src/experiments/abExperiment.js";
import {
	getBuildVariant,
	initBuildVariant,
	isVariantB,
	startVariantWindow,
	variantForWindow,
} from "../../../src/experiments/buildVariant.js";

const ENDPOINT = "http://10.192.11.9:8082";

afterEach(() => {
	initBuildVariant({ endpoint: "", enabled: false });
});

test("no build enables an experiment unless its branch flips the switch", () => {
	expect(AB_EXPERIMENT.enabled).toBe(false);
	initBuildVariant({ endpoint: ENDPOINT });
	for (const windowIndex of [0, 1, 2, 3])
		expect(startVariantWindow({ windowIndex })).toBeNull();
	expect(isVariantB()).toBe(false);
});

test("every task runs both variants, about half its windows each, and a window's variant is reproducible", () => {
	for (const endpoint of [ENDPOINT, "http://10.192.10.59:8082"]) {
		const variants = Array.from({ length: 30 }, (_, windowIndex) =>
			variantForWindow({ endpoint, windowIndex }),
		);
		const bs = variants.filter((variant) => variant === "B").length;
		expect(bs).toBeGreaterThanOrEqual(9);
		expect(bs).toBeLessThanOrEqual(21);
		expect(variantForWindow({ endpoint, windowIndex: 7 })).toBe(variants[7]);
	}
});

test("windows are hashed, not strictly alternating, so periodic bursts can't line up with one variant", () => {
	const variants = Array.from({ length: 30 }, (_, windowIndex) =>
		variantForWindow({ endpoint: ENDPOINT, windowIndex }),
	);
	const alternating = variants.every(
		(variant, index) => index === 0 || variant !== variants[index - 1],
	);
	expect(alternating).toBe(false);
});

test("an enabled experiment switches the guard as each window opens", () => {
	initBuildVariant({ endpoint: ENDPOINT, enabled: true });
	for (const windowIndex of [1, 2, 3, 4, 5, 6]) {
		const variant = startVariantWindow({ windowIndex });
		expect(variant).toBe(variantForWindow({ endpoint: ENDPOINT, windowIndex }));
		expect(getBuildVariant()).toBe(variant);
		expect(isVariantB()).toBe(variant === "B");
	}
});
