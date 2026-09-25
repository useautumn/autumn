import { beforeEach, expect, test } from "bun:test";
import type { TestExecutor } from "../../testScripts/testExecutor";
import { getDashboardSnapshot } from "../dashboard/server";
import { planShardWorkers } from "../helpers/planShardWorkers";
import { getSvixAppIds } from "../helpers/registry";
import { runShardTests } from "./runShardTests";
import { resetTui } from "./store";

beforeEach(resetTui);

test("Svix workers exist only for selected Svix files", () => {
	expect(
		planShardWorkers({ workers: 200, normalFileCount: 689, svixFileCount: 0 }),
	).toEqual({ totalWorkers: 200, svixWorkers: 0 });
	expect(
		planShardWorkers({ workers: 200, normalFileCount: 689, svixFileCount: 26 }),
	).toEqual({ totalWorkers: 200, svixWorkers: 7 });
	expect(
		planShardWorkers({ workers: 200, normalFileCount: 0, svixFileCount: 1 }),
	).toEqual({ totalWorkers: 1, svixWorkers: 1 });
	expect(() =>
		planShardWorkers({ workers: 1, normalFileCount: 1, svixFileCount: 1 }),
	).toThrow("--max>=2");
});

test("a busy Svix shard does not block normal tests or overwrite the combined count", async () => {
	const releaseSvix = Promise.withResolvers<void>();
	const normalFinished = Promise.withResolvers<void>();
	const executed: string[] = [];
	const runSvix: TestExecutor["run"] = async ({ file, onChunk }) => {
		await releaseSvix.promise;
		executed.push(file);
		onChunk("(pass) svix [1ms]\n");
		return { exitCode: 0, stderr: "" };
	};
	const runNormal: TestExecutor["run"] = async ({ file, onChunk }) => {
		executed.push(file);
		onChunk("(pass) normal [1ms]\n");
		normalFinished.resolve();
		return { exitCode: 0, stderr: "" };
	};
	const completion = runShardTests({
		shards: [
			{
				files: ["svix-1.test.ts", "svix-2.test.ts"],
				executor: { run: runSvix },
				maxParallel: 1,
			},
			{
				files: ["normal.test.ts"],
				executor: { run: runNormal },
				maxParallel: 1,
			},
		],
	});
	try {
		await normalFinished.promise;
		expect(executed).toEqual(["normal.test.ts"]);
		expect(getDashboardSnapshot().run.total).toBe(3);
	} finally {
		releaseSvix.resolve();
		await completion;
	}
	expect(getDashboardSnapshot().run).toMatchObject({
		total: 3,
		done: 3,
		passed: 3,
		failed: 0,
	});
});

test("cleanup includes each Svix application and legacy registry entries", () => {
	expect(getSvixAppIds({})).toEqual([]);
	expect(getSvixAppIds({ svixAppId: "app_old" })).toEqual(["app_old"]);
	expect(
		getSvixAppIds({ svixAppId: "app_old", svixAppIds: ["app_old", "app_new"] }),
	).toEqual(["app_old", "app_new"]);
});
