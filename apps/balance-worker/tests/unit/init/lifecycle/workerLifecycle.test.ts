import { describe, expect, test } from "bun:test";
import { startWorker } from "../../../../src/init/lifecycle/startWorker.js";
import { stopWorker } from "../../../../src/init/lifecycle/stopWorker.js";
import type { WorkerLifecycleContext } from "../../../../src/init/types/balanceWorker.js";
import type { BalanceWorkerState } from "../../../../src/init/types/balanceWorkerState.js";

function createLifecycleFixture({ ctx }: { ctx: WorkerLifecycleContext }) {
	const state: BalanceWorkerState = { status: "created" };
	function start(): Promise<void> {
		return startWorker({ ctx, state });
	}
	function stop(): Promise<void> {
		return stopWorker({ ctx, state });
	}
	return { start, stop };
}

const fixture = ({
	failStart = false,
	failQuiescence = false,
}: {
	failStart?: boolean;
	failQuiescence?: boolean;
} = {}) => {
	const calls: string[] = [];
	let finishDrain: () => void = () => undefined;
	const draining = new Promise<void>((resolve) => {
		finishDrain = resolve;
	});
	const process = createLifecycleFixture({
		ctx: {
			partitions: {
				start: async () => {
					calls.push("start");
					if (failStart) throw new Error("startup");
				},
				stop: async () => {
					calls.push("withdraw");
					await draining;
					calls.push("drained");
				},
			},
			listen: () => {
				calls.push("listen");
				return {
					stop: async () => {
						calls.push("http-stop");
					},
				};
			},
			settleResources: async () => {
				calls.push("quiescence");
				if (failQuiescence) throw new Error("not quiescent");
			},
			closeStore: () => {
				calls.push("store-close");
			},
		},
	});
	return { process, calls, finishDrain };
};
describe("Balance worker process lifecycle", () => {
	test("listens before ownership can publish and closes state only after drain and quiescence", async () => {
		const { process, calls, finishDrain } = fixture();
		await process.start();
		expect(calls).toEqual(["listen", "start"]);
		const stopping = process.stop();
		expect(calls).toContain("withdraw");
		expect(calls).not.toContain("store-close");
		finishDrain();
		await stopping;
		expect(calls.indexOf("withdraw")).toBeLessThan(calls.indexOf("http-stop"));
		expect(calls.indexOf("quiescence")).toBeLessThan(
			calls.indexOf("store-close"),
		);
		await process.stop();
		expect(calls.filter((call) => call === "store-close")).toHaveLength(1);
	});
	test("failed startup cleans up the listener and resources", async () => {
		const { process, calls, finishDrain } = fixture({ failStart: true });
		finishDrain();
		await expect(process.start()).rejects.toThrow("startup");
		expect(calls).toContain("http-stop");
		expect(calls).toContain("store-close");
	});
	test("shutdown during startup waits for ownership before disposing resources", async () => {
		let finishStart: () => void = () => undefined;
		const starting = new Promise<void>((resolve) => {
			finishStart = resolve;
		});
		const calls: string[] = [];
		const process = createLifecycleFixture({
			ctx: {
				partitions: {
					start: () => starting,
					stop: async () => {
						calls.push("withdraw");
					},
				},
				listen: () => ({
					stop: () => {
						calls.push("http-stop");
					},
				}),
				settleResources: async () => {
					calls.push("settled");
				},
				closeStore: () => {
					calls.push("closed");
				},
			},
		});
		const startup = process.start();
		const shutdown = process.stop();
		expect(calls).toEqual([]);
		finishStart();
		await startup;
		await shutdown;
		expect(calls).toEqual(["withdraw", "http-stop", "settled", "closed"]);
	});
	test("failed quiescence never closes SQLite", async () => {
		const { process, calls, finishDrain } = fixture({ failQuiescence: true });
		await process.start();
		finishDrain();
		await expect(process.stop()).rejects.toThrow("not quiescent");
		expect(calls).not.toContain("store-close");
		expect(calls).toContain("http-stop");
	});
});

async function reusesShutdownPromise(): Promise<void> {
	const { process, finishDrain } = fixture();
	await process.start();
	const stopping = process.stop();
	expect(process.stop()).toBe(stopping);
	finishDrain();
	await stopping;
	expect(process.stop()).toBe(stopping);
	await expect(process.start()).rejects.toThrow(
		"Cannot start worker while stopped",
	);
}

test(
	"worker shutdown is idempotent and stopped workers cannot restart",
	reusesShutdownPromise,
);
