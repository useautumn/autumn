import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";

// Capture real modules BEFORE mocking — mock.module leaks across test files
// (mock.restore does not undo it), so afterAll re-mocks with the real exports.
const realEdgeConfigRegistry = {
	...(await import("@/internal/misc/edgeConfig/edgeConfigRegistry.js")),
};
const realQueueUtils = { ...(await import("@/queue/queueUtils.js")) };

mock.module("@/internal/misc/edgeConfig/edgeConfigRegistry.js", () => ({
	registerEdgeConfig: () => undefined,
}));

const queuedJobs: Record<string, unknown>[] = [];
mock.module("@/queue/queueUtils.js", () => ({
	addTaskToQueue: async (args: Record<string, unknown>) => {
		queuedJobs.push(args);
	},
}));

const { _setBatchResetConfigForTesting } = await import(
	"@/internal/misc/batchReset/batchResetConfigStore.js"
);
const { workflows } = await import("@/queue/workflows.js");

const payload = {
	orgId: "org_test",
	env: "sandbox",
	resets: [],
};

const reset = () => {
	queuedJobs.length = 0;
	_setBatchResetConfigForTesting({ config: { enabled: true } });
};

describe("batch reset workflow edge config", () => {
	afterEach(reset);

	test("does not enqueue batch reset jobs when disabled", async () => {
		_setBatchResetConfigForTesting({ config: { enabled: false } });

		await workflows.triggerBatchResetCusEnts(payload);

		expect(queuedJobs).toHaveLength(0);
	});

	test("enqueues batch reset jobs when enabled", async () => {
		await workflows.triggerBatchResetCusEnts(payload);

		expect(queuedJobs).toHaveLength(1);
		expect(queuedJobs[0]?.jobName).toBe("batch-reset-cus-ents");
	});
});

afterAll(() => {
	mock.module(
		"@/internal/misc/edgeConfig/edgeConfigRegistry.js",
		() => realEdgeConfigRegistry,
	);
	mock.module("@/queue/queueUtils.js", () => realQueueUtils);
	mock.restore();
});
