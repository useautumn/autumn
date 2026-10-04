import { afterEach, expect, test } from "bun:test";
import { AB_EXPERIMENT } from "../../../src/experiments/abExperiment.js";
import {
	getBuildVariant,
	initBuildVariant,
	isVariant,
	startVariantWindow,
	variantForWindow,
} from "../../../src/experiments/buildVariant.js";

const ENDPOINT = "http://10.192.11.9:8082";
const ENDPOINTS = [ENDPOINT, "http://10.192.10.59:8082"];

afterEach(() => {
	initBuildVariant({ endpoint: "", enabled: false });
});

test("no build enables an experiment unless its branch flips the switch", () => {
	expect(AB_EXPERIMENT).toEqual({ enabled: false, arms: 2 });
	initBuildVariant({ endpoint: ENDPOINT });
	for (const windowIndex of [0, 1, 2, 3])
		expect(startVariantWindow({ windowIndex })).toBeNull();
	for (const variant of ["A", "B", "C", "D"] as const)
		expect(isVariant({ variant })).toBe(false);
});

test("every task runs both arms of a 2-arm build, about half its windows each, reproducibly", () => {
	for (const endpoint of ENDPOINTS) {
		const variants = Array.from({ length: 30 }, (_, windowIndex) =>
			variantForWindow({ endpoint, windowIndex, arms: 2 }),
		);
		expect(new Set(variants)).toEqual(new Set(["A", "B"]));
		const bs = variants.filter((variant) => variant === "B").length;
		expect(bs).toBeGreaterThanOrEqual(9);
		expect(bs).toBeLessThanOrEqual(21);
		expect(variantForWindow({ endpoint, windowIndex: 7, arms: 2 })).toBe(
			variants[7],
		);
	}
});

test("a 4-arm build spreads every task's windows across A..D, about a quarter each", () => {
	for (const endpoint of ENDPOINTS) {
		const variants = Array.from({ length: 200 }, (_, windowIndex) =>
			variantForWindow({ endpoint, windowIndex, arms: 4 }),
		);
		for (const arm of ["A", "B", "C", "D"]) {
			const count = variants.filter((variant) => variant === arm).length;
			expect(count).toBeGreaterThanOrEqual(30);
			expect(count).toBeLessThanOrEqual(70);
		}
	}
});

test("a 3-arm build never runs arm D", () => {
	const variants = Array.from({ length: 100 }, (_, windowIndex) =>
		variantForWindow({ endpoint: ENDPOINT, windowIndex, arms: 3 }),
	);
	expect(new Set(variants)).toEqual(new Set(["A", "B", "C"]));
});

test("windows are hashed, not strictly alternating, so periodic bursts can't line up with one arm", () => {
	const variants = Array.from({ length: 30 }, (_, windowIndex) =>
		variantForWindow({ endpoint: ENDPOINT, windowIndex, arms: 2 }),
	);
	const alternating = variants.every(
		(variant, index) => index === 0 || variant !== variants[index - 1],
	);
	expect(alternating).toBe(false);
});

test("an enabled experiment switches the guard to the arm of each window as it opens", () => {
	initBuildVariant({ endpoint: ENDPOINT, enabled: true, arms: 4 });
	for (const windowIndex of [1, 2, 3, 4, 5, 6, 7, 8]) {
		const variant = startVariantWindow({ windowIndex });
		expect(variant).toBe(
			variantForWindow({ endpoint: ENDPOINT, windowIndex, arms: 4 }),
		);
		expect(getBuildVariant()).toBe(variant);
		for (const arm of ["A", "B", "C", "D"] as const)
			expect(isVariant({ variant: arm })).toBe(arm === variant);
	}
});
