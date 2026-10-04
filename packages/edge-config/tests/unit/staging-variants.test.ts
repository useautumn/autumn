import { afterEach, describe, expect, test } from "bun:test";
import {
	activeArmsOf,
	armForWindow,
	bindStagingVariants,
	createEdgeConfigStore,
	type EdgeConfigS3Client,
	STAGING_VARIANT_WINDOW_MS,
	STAGING_VARIANTS_BUCKET,
	type StagingArm,
	type StagingVariantsConfig,
	stagingVariantsEdgeConfig,
	stagingVariantsEnabled,
	variant,
	variants,
} from "../../src/edgeConfig.js";

const IDENTITY = "http://10.192.11.9:8082";
const configWith = (
	experiments: Record<string, { arms: string[]; scope?: "window" | "task" }>,
): StagingVariantsConfig => ({
	experiments,
	updatedAt: new Date().toISOString(),
});

/** An S3 with one object per key that can be made to fail. */
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

const createBoundStore = ({
	bucket = STAGING_VARIANTS_BUCKET,
}: {
	bucket?: string;
} = {}) => {
	const { s3, client } = createS3();
	const store = createEdgeConfigStore({
		ctx: {
			location: () => ({ bucket: "test", region: "us-east-2" }),
			s3Client: client,
		},
		s3Key: stagingVariantsEdgeConfig.key,
		schema: stagingVariantsEdgeConfig.schema,
		defaultValue: stagingVariantsEdgeConfig.defaultValue,
		retainOnError: true,
	});
	const clock = { now: 1_000 * STAGING_VARIANT_WINDOW_MS };
	const bound = bindStagingVariants({
		read: store.get,
		identity: IDENTITY,
		bucket,
		now: () => clock.now,
	});
	const nextWindow = () => {
		clock.now += STAGING_VARIANT_WINDOW_MS;
	};
	const write = async (experiments: Record<string, { arms: string[] }>) => {
		await store.writeToSource({ config: configWith(experiments) });
		await store.refresh();
	};
	return { s3, store, write, nextWindow, clock, bound };
};

const armsOver = ({
	experiment,
	windows,
	nextWindow,
}: {
	experiment: string;
	windows: number;
	nextWindow: () => void;
}) =>
	Array.from({ length: windows }, () => {
		nextWindow();
		return variant(experiment);
	});

afterEach(() => {
	bindStagingVariants({
		read: stagingVariantsEdgeConfig.defaultValue,
		identity: "",
		bucket: STAGING_VARIANTS_BUCKET,
	});
});

describe("variant()", () => {
	test("runs A when nothing is bound, the key is missing, or the experiment isn't listed", async () => {
		bindStagingVariants({
			read: () => {
				throw new Error("unbound");
			},
			identity: IDENTITY,
			bucket: STAGING_VARIANTS_BUCKET,
		});
		expect(variant("slice")).toBe("A");
		expect(variants()).toBeNull();

		const { store, nextWindow } = createBoundStore();
		await store.refresh();
		expect(store.getStatus().healthy).toBe(true);
		nextWindow();
		expect(variant("slice")).toBe("A");
		expect(variants()).toBeNull();
	});

	test("an invalid experiment runs A alone and leaves valid ones live", async () => {
		const { write, nextWindow } = createBoundStore();
		await write({
			slice: { arms: ["A", "B", "C"] },
			"Bad Name": { arms: ["A", "B"] },
			"b-first": { arms: ["B", "A"] },
			solo: { arms: ["A"] },
			dupes: { arms: ["A", "B", "B"] },
			unknown: { arms: ["A", "E"] },
			five: { arms: ["A", "B", "C", "D", "D"] },
		});
		nextWindow();
		expect(Object.keys(variants() ?? {})).toEqual(["slice"]);
		for (const experiment of [
			"Bad Name",
			"b-first",
			"solo",
			"dupes",
			"unknown",
		])
			expect(variant(experiment)).toBe("A");
	});

	test("every arm of a live experiment runs, each about evenly, and the snapshot matches", async () => {
		const { write, nextWindow } = createBoundStore();
		await write({
			slice: { arms: ["A", "B", "C", "D"] },
			aa: { arms: ["A", "B"] },
		});
		const seen = armsOver({ experiment: "slice", windows: 200, nextWindow });
		for (const arm of ["A", "B", "C", "D"]) {
			const count = seen.filter((seenArm) => seenArm === arm).length;
			expect(count).toBeGreaterThanOrEqual(30);
			expect(count).toBeLessThanOrEqual(70);
		}
		expect(variants()).toEqual({ slice: variant("slice"), aa: variant("aa") });
		expect(variants()).toBe(variants());
	});

	test("experiments hash independently, so two experiments don't share their windows", async () => {
		const { write, nextWindow } = createBoundStore();
		await write({ one: { arms: ["A", "B"] }, two: { arms: ["A", "B"] } });
		const pairs = Array.from({ length: 100 }, () => {
			nextWindow();
			return variant("one") === variant("two");
		});
		expect(pairs.filter(Boolean).length).toBeGreaterThan(30);
		expect(pairs.filter(Boolean).length).toBeLessThan(70);
	});

	test("consecutive windows switch arm about half the time, never in lockstep", () => {
		for (const identity of [IDENTITY, "http://10.192.10.59:8082"]) {
			const arms = Array.from({ length: 1_000 }, (_, offset) =>
				armForWindow({
					identity,
					windowIndex: 177_000_000 + offset,
					experiment: "slice",
					arms: ["A", "B"],
				}),
			);
			const switches = arms.filter(
				(arm, index) => index > 0 && arm !== arms[index - 1],
			).length;
			expect(switches).toBeGreaterThan(420);
			expect(switches).toBeLessThan(580);
		}
	});

	test("a window's arm is reproducible from identity, wall-clock window and experiment", async () => {
		const { write, clock } = createBoundStore();
		await write({ slice: { arms: ["A", "B", "C"] } });
		expect(variant("slice")).toBe(
			armForWindow({
				identity: IDENTITY,
				windowIndex: Math.floor(clock.now / STAGING_VARIANT_WINDOW_MS),
				experiment: "slice",
				arms: ["A", "B", "C"],
			}),
		);
	});

	test("a task-scoped experiment keeps one arm per task across every window, and splits tasks", () => {
		let now = 0;
		const read = () =>
			configWith({
				layout: { arms: ["A", "B"], scope: "task" },
				knob: { arms: ["A", "B"] },
			});
		bindStagingVariants({
			read,
			identity: IDENTITY,
			bucket: STAGING_VARIANTS_BUCKET,
			now: () => now,
		});
		const first = variant("layout");
		const knobArms = new Set<StagingArm>();
		for (let window = 0; window < 200; window++) {
			now = window * STAGING_VARIANT_WINDOW_MS;
			expect(variant("layout")).toBe(first);
			knobArms.add(variant("knob"));
		}
		// The window-scoped experiment beside it still moves.
		expect(knobArms.size).toBe(2);
		const taskArms = new Set<StagingArm>();
		for (let task = 0; task < 40; task++) {
			bindStagingVariants({
				read,
				identity: `http://10.192.11.${task}:8082`,
				bucket: STAGING_VARIANTS_BUCKET,
				now: () => now,
			});
			taskArms.add(variant("layout"));
		}
		expect(taskArms.size).toBe(2);
	});

	test("a config change lands at the next window boundary, not mid-window", async () => {
		const { write, nextWindow } = createBoundStore();
		await write({});
		nextWindow();
		expect(variant("slice")).toBe("A");
		await write({ slice: { arms: ["A", "B"] } });
		expect(variants()).toBeNull();
		const seen = armsOver({ experiment: "slice", windows: 30, nextWindow });
		expect(new Set(seen)).toEqual(new Set<StagingArm>(["A", "B"]));
	});

	test("a failed read keeps the last experiments live", async () => {
		const { s3, store, write, nextWindow } = createBoundStore();
		await write({ slice: { arms: ["A", "B"] } });
		s3.failing = true;
		await store.refresh();
		expect(store.getStatus().healthy).toBe(false);
		const seen = armsOver({ experiment: "slice", windows: 30, nextWindow });
		expect(new Set(seen)).toEqual(new Set<StagingArm>(["A", "B"]));
	});
});

test("arms must start with A and hold 2–4 distinct arms from A–D", () => {
	expect(activeArmsOf({ arms: ["A", "D"] })).toEqual(["A", "D"]);
	expect(activeArmsOf({ arms: ["A", "B", "C", "D"] })).toEqual([
		"A",
		"B",
		"C",
		"D",
	]);
	for (const arms of [[], ["A"], ["B", "A"], ["A", "A"], ["A", "E"]])
		expect(activeArmsOf({ arms })).toEqual([]);
});

test("a task-scoped experiment can pin the whole fleet to one arm other than A", () => {
	expect(activeArmsOf({ arms: ["D"], scope: "task" })).toEqual(["D"]);
	expect(activeArmsOf({ arms: ["D"] })).toEqual([]);
	expect(activeArmsOf({ arms: ["D"], scope: "window" })).toEqual([]);
	for (const arms of [["A"], ["E"], []])
		expect(activeArmsOf({ arms, scope: "task" })).toEqual([]);
});

describe("the staging-only gate", () => {
	test("only the staging admin bucket can turn variants on", () => {
		expect(stagingVariantsEnabled({ bucket: "autumn-staging" })).toBe(true);
		for (const bucket of [
			"autumn-prod-server",
			"autumn-dev-server",
			"autumn-staging-copy",
			"",
		])
			expect(stagingVariantsEnabled({ bucket })).toBe(false);
	});

	for (const bucket of ["autumn-prod-server", "autumn-dev-server"])
		test(`a live config on ${bucket} never binds, so every arm is A`, async () => {
			const { bound, write, nextWindow } = createBoundStore({ bucket });
			expect(bound).toBe(false);
			await write({
				slice: { arms: ["A", "B", "C", "D"] },
				aa: { arms: ["A", "B"] },
			});
			for (const experiment of ["slice", "aa"])
				expect(
					new Set(armsOver({ experiment, windows: 50, nextWindow })),
				).toEqual(new Set<StagingArm>(["A"]));
			expect(variants()).toBeNull();
		});

	test("the staging bucket binds and runs every live arm", async () => {
		const { bound, write, nextWindow } = createBoundStore({
			bucket: "autumn-staging",
		});
		expect(bound).toBe(true);
		await write({ slice: { arms: ["A", "B"] } });
		expect(
			new Set(armsOver({ experiment: "slice", windows: 30, nextWindow })),
		).toEqual(new Set<StagingArm>(["A", "B"]));
	});
});
