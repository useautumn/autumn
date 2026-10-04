import { describe, expect, test } from "bun:test";
import { armForWindow, createTaskVariantAtBoot } from "../../src/edgeConfig.js";

const experiment = "server-forks";
const identityForB = Array.from(
	{ length: 100 },
	(_, index) => `task-${index}`,
).find(
	(identity) =>
		armForWindow({
			identity,
			windowIndex: -1,
			experiment,
			arms: ["A", "B"],
		}) === "B",
);
if (!identityForB)
	throw new Error("No B identity in deterministic test inputs");
const config = (scope: "task" | "window" = "task", arms = ["A", "B"]) => ({
	experiments: { [experiment]: { scope, arms } },
	updatedAt: new Date(0).toISOString(),
});

describe("task variant captured at boot", () => {
	test("B is selected once, shared by concurrent callers and unchanged after config edits", async () => {
		let reads = 0;
		let identities = 0;
		let source = config();
		const mode = createTaskVariantAtBoot({
			bucket: "autumn-staging",
			experiment,
			allowedArms: ["A", "B"],
			read: async () => {
				reads++;
				return source;
			},
			identity: async () => {
				identities++;
				return identityForB;
			},
		});
		expect(await Promise.all([mode.read(), mode.read()])).toEqual(["B", "B"]);
		source = config("window");
		expect(await mode.read()).toBe("B");
		expect(reads).toBe(1);
		expect(identities).toBe(1);
	});

	test("prod, dev and lookalike buckets never read config or resolve identity", async () => {
		for (const bucket of [
			"autumn-prod-server",
			"autumn-dev-server",
			"",
			"autumn-staging-server",
			"autumn-staging/",
		]) {
			let reads = 0;
			let identities = 0;
			const mode = createTaskVariantAtBoot({
				bucket,
				experiment,
				allowedArms: ["A", "B"],
				read: async () => {
					reads++;
					throw new Error("must not read");
				},
				identity: async () => {
					identities++;
					throw new Error("must not resolve");
				},
			});
			expect(await mode.read()).toBe("A");
			expect(reads).toBe(0);
			expect(identities).toBe(0);
		}
	});

	test("window scope, unsupported arms, missing config and missing identity stay A", async () => {
		for (const source of [
			config("window"),
			config("task", ["A", "B", "C"]),
			config("task", ["B", "A"]),
			config("task", ["A"]),
			{ experiments: {}, updatedAt: "" },
		]) {
			const mode = createTaskVariantAtBoot({
				bucket: "autumn-staging",
				experiment,
				allowedArms: ["A", "B"],
				read: async () => source,
				identity: async () => identityForB,
			});
			expect(await mode.read()).toBe("A");
		}
		const mode = createTaskVariantAtBoot({
			bucket: "autumn-staging",
			experiment,
			allowedArms: ["A", "B"],
			read: async () => config(),
			identity: async () => null,
		});
		expect(await mode.read()).toBe("A");
	});

	test("a failed boot read is pinned to A, never retried into B mid-task", async () => {
		let reads = 0;
		const mode = createTaskVariantAtBoot({
			bucket: "autumn-staging",
			experiment,
			allowedArms: ["A", "B"],
			read: async () => {
				reads++;
				throw new Error("S3 down");
			},
			identity: async () => identityForB,
		});
		expect(await mode.read()).toBe("A");
		expect(await mode.read()).toBe("A");
		expect(reads).toBe(1);
	});
});
