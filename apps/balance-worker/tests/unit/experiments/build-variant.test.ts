import { afterEach, describe, expect, test } from "bun:test";
import type { EdgeConfigS3Client } from "@autumn/edge-config";
import { createWorkerEdgeConfigs } from "../../../src/edgeConfig/createWorkerEdgeConfigs.js";
import { AB_EXPERIMENT } from "../../../src/experiments/abExperiment.js";
import {
	activeArmsOf,
	type BuildVariant,
	getBuildVariant,
	initBuildVariant,
	isVariant,
	startVariantWindow,
	variantForWindow,
} from "../../../src/experiments/buildVariant.js";

const ENDPOINT = "http://10.192.11.9:8082";
const ENDPOINTS = [ENDPOINT, "http://10.192.10.59:8082"];
const ALL_ARMS: BuildVariant[] = ["A", "B", "C", "D"];

/** An S3 with one object per key that can be made to fail, so a write lands where the next read looks. */
const createS3 = () => {
	const objects = new Map<string, string>();
	const s3 = { failing: false };
	const client: EdgeConfigS3Client = {
		send: async (command) => {
			if (s3.failing) throw new Error("S3 unreachable");
			const { Key, Body } = command.input as { Key?: string; Body?: string };
			if (Body !== undefined) {
				objects.set(Key ?? "", Body);
				return {};
			}
			const stored = objects.get(Key ?? "");
			if (stored === undefined) {
				const missing = new Error("NoSuchKey");
				missing.name = "NoSuchKey";
				throw missing;
			}
			return { Body: { transformToString: async () => stored } };
		},
	};
	return { s3, client };
};

const createArmsStore = () => {
	const { s3, client } = createS3();
	const { arms } = createWorkerEdgeConfigs({
		ctx: { s3Client: client },
		config: { location: { bucket: "test", region: "us-east-2" } },
	});
	const setArms = async ({ armList }: { armList: string[] }) => {
		await arms.writeToSource({
			config: { arms: armList, updatedAt: new Date().toISOString() },
		});
		await arms.refresh();
	};
	return { s3, arms, setArms };
};

const openWindows = ({ from, count }: { from: number; count: number }) =>
	Array.from({ length: count }, (_, offset) =>
		startVariantWindow({ windowIndex: from + offset }),
	);

afterEach(() => {
	initBuildVariant({ endpoint: "", readConfiguredArms: () => [] });
});

describe("which arms run", () => {
	test("a plain build carries only the control, so no config can start an experiment", () => {
		expect(AB_EXPERIMENT.arms).toEqual(["A"]);
		initBuildVariant({
			endpoint: ENDPOINT,
			readConfiguredArms: () => ALL_ARMS,
		});
		expect(openWindows({ from: 0, count: 4 })).toEqual([
			null,
			null,
			null,
			null,
		]);
		for (const variant of ALL_ARMS) expect(isVariant({ variant })).toBe(false);
	});

	test("with no arms config in the bucket every window runs unlabelled", async () => {
		const { arms } = createArmsStore();
		await arms.refresh();
		expect(arms.getStatus().healthy).toBe(true);
		initBuildVariant({
			endpoint: ENDPOINT,
			readConfiguredArms: () => arms.get().arms,
			builtArms: ALL_ARMS,
		});
		expect(openWindows({ from: 0, count: 4 })).toEqual([
			null,
			null,
			null,
			null,
		]);
		expect(getBuildVariant()).toBeNull();
	});

	test("unknown and unbuilt arms are ignored, and the control always leads", () => {
		expect(
			activeArmsOf({ configured: ["C", "E", "B", "Z"], built: ["A", "B"] }),
		).toEqual(["A", "B"]);
		expect(
			activeArmsOf({ configured: ["D", "B", "A"], built: ALL_ARMS }),
		).toEqual(["A", "B", "D"]);
		expect(activeArmsOf({ configured: ["A"], built: ALL_ARMS })).toEqual([]);
		expect(activeArmsOf({ configured: ["C"], built: ["A", "B"] })).toEqual([]);
	});

	test("a config change mid-run applies from the next window, not the open one", async () => {
		const { arms, setArms } = createArmsStore();
		await setArms({ armList: ["A", "B"] });
		initBuildVariant({
			endpoint: ENDPOINT,
			readConfiguredArms: () => arms.get().arms,
			builtArms: ALL_ARMS,
		});
		const open = startVariantWindow({ windowIndex: 1 });
		expect(open?.arms).toEqual(["A", "B"]);

		await setArms({ armList: ["A", "B", "C", "D"] });
		expect(getBuildVariant()).toBe(open?.variant ?? null);
		const next = openWindows({ from: 2, count: 40 });
		for (const window of next) expect(window?.arms).toEqual(ALL_ARMS);
		expect(new Set(next.map((window) => window?.variant))).toEqual(
			new Set(ALL_ARMS),
		);

		await setArms({ armList: [] });
		expect(startVariantWindow({ windowIndex: 42 })).toBeNull();
	});

	test("a failed read keeps the last arms instead of switching the experiment off", async () => {
		const { s3, arms, setArms } = createArmsStore();
		await setArms({ armList: ["A", "B", "C"] });
		initBuildVariant({
			endpoint: ENDPOINT,
			readConfiguredArms: () => arms.get().arms,
			builtArms: ALL_ARMS,
		});
		s3.failing = true;
		await arms.refresh();
		expect(arms.getStatus().healthy).toBe(false);
		expect(startVariantWindow({ windowIndex: 1 })?.arms).toEqual([
			"A",
			"B",
			"C",
		]);
	});
});

describe("which arm a window runs", () => {
	test("every task runs both arms of a 2-arm rung, about half its windows each, reproducibly", () => {
		for (const endpoint of ENDPOINTS) {
			const variants = Array.from({ length: 30 }, (_, windowIndex) =>
				variantForWindow({ endpoint, windowIndex, arms: ["A", "B"] }),
			);
			const bs = variants.filter((variant) => variant === "B").length;
			expect(bs).toBeGreaterThanOrEqual(9);
			expect(bs).toBeLessThanOrEqual(21);
			expect(
				variantForWindow({ endpoint, windowIndex: 7, arms: ["A", "B"] }),
			).toBe(variants[7]);
		}
	});

	test("a 4-arm rung spreads every task's windows across A..D, about a quarter each", () => {
		for (const endpoint of ENDPOINTS) {
			const variants = Array.from({ length: 200 }, (_, windowIndex) =>
				variantForWindow({ endpoint, windowIndex, arms: ALL_ARMS }),
			);
			for (const arm of ALL_ARMS) {
				const count = variants.filter((variant) => variant === arm).length;
				expect(count).toBeGreaterThanOrEqual(30);
				expect(count).toBeLessThanOrEqual(70);
			}
		}
	});

	test("windows are hashed, not strictly alternating, so periodic bursts can't line up with one arm", () => {
		const variants = Array.from({ length: 30 }, (_, windowIndex) =>
			variantForWindow({ endpoint: ENDPOINT, windowIndex, arms: ["A", "B"] }),
		);
		const alternating = variants.every(
			(variant, index) => index === 0 || variant !== variants[index - 1],
		);
		expect(alternating).toBe(false);
	});

	test("the guard follows the arm of each window as it opens", () => {
		initBuildVariant({
			endpoint: ENDPOINT,
			readConfiguredArms: () => ALL_ARMS,
			builtArms: ALL_ARMS,
		});
		for (const windowIndex of [1, 2, 3, 4, 5, 6, 7, 8]) {
			const window = startVariantWindow({ windowIndex });
			expect(window?.variant).toBe(
				variantForWindow({ endpoint: ENDPOINT, windowIndex, arms: ALL_ARMS }),
			);
			expect(getBuildVariant()).toBe(window?.variant ?? null);
			for (const arm of ALL_ARMS)
				expect(isVariant({ variant: arm })).toBe(arm === window?.variant);
		}
	});
});
