import { afterEach, expect, test } from "bun:test";
import { AB_EXPERIMENT } from "../../../src/experiments/abExperiment.js";
import {
	getBuildVariant,
	initBuildVariant,
	isVariantB,
	variantForEndpoint,
} from "../../../src/experiments/buildVariant.js";

afterEach(() => {
	initBuildVariant({ endpoint: "", enabled: false });
});

test("no build enables an experiment unless its branch flips the switch", () => {
	expect(AB_EXPERIMENT.enabled).toBe(false);
	initBuildVariant({ endpoint: "http://10.192.11.9:8082" });
	expect(getBuildVariant()).toBeNull();
	expect(isVariantB()).toBe(false);
});

test("a task keeps one variant, and a 30-task fleet splits close to half", () => {
	const endpoints = Array.from(
		{ length: 30 },
		(_, index) => `http://10.192.${10 + (index % 2)}.${20 + index * 7}:8082`,
	);
	for (const endpoint of endpoints)
		expect(variantForEndpoint({ endpoint })).toBe(
			variantForEndpoint({ endpoint }),
		);
	const bs = endpoints.filter(
		(endpoint) => variantForEndpoint({ endpoint }) === "B",
	).length;
	expect(bs).toBeGreaterThanOrEqual(9);
	expect(bs).toBeLessThanOrEqual(21);
});

test("an enabled experiment gates the change on variant B tasks only", () => {
	const endpoint = ["a", "b", "c", "d", "e", "f"]
		.map((suffix) => `http://task-${suffix}:8082`)
		.find((candidate) => variantForEndpoint({ endpoint: candidate }) === "B");
	expect(endpoint).toBeDefined();
	expect(initBuildVariant({ endpoint: endpoint ?? "", enabled: true })).toBe(
		"B",
	);
	expect(isVariantB()).toBe(true);
});
