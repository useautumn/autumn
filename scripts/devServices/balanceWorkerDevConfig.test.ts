import { describe, expect, test } from "bun:test";
import { balanceWorkerDevConfig } from "./balanceWorkerDevConfig.ts";

describe("local balance worker launch settings", () => {
	test("assigns collision-free per-worktree listener ports", () => {
		const ports = new Set<number>();
		for (let worktreeNum = 1; worktreeNum <= 50; worktreeNum++) {
			const env = balanceWorkerDevConfig({ worktreeNum, runtimeEnv: {} });
			const port = Number(env.BALANCE_WORKER_PORT);
			expect(ports.has(port)).toBe(false);
			ports.add(port);
			expect(env.BALANCE_WORKER_ENDPOINT).toBe(`http://127.0.0.1:${port}`);
		}
		expect(
			balanceWorkerDevConfig({ worktreeNum: 50, runtimeEnv: {} })
				.BALANCE_WORKER_PORT,
		).toBe("12982");
	});
	test("keeps the configured worktree broker and explicit topic names", () => {
		const env = balanceWorkerDevConfig({
			worktreeNum: 50,
			runtimeEnv: {
				KAFKA_BROKERS: "127.0.0.1:23992",
				BALANCE_WORKER_METERING_TOPIC: "custom",
			},
		});
		expect(env.KAFKA_BROKERS).toBe("127.0.0.1:23992");
		expect(env.BALANCE_WORKER_METERING_TOPIC).toBe("custom");
	});
});
