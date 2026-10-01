import { describe, expect, test } from "bun:test";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import type { BalanceWorkerHttpContext } from "../../../src/http/types/balanceWorkerHttp.js";

function createApp({ enabled }: { enabled: boolean }): {
	blocked: number[];
	post(body: unknown): Promise<Response>;
	warnings: string[];
} {
	const blocked: number[] = [];
	const warnings: string[] = [];
	const ctx: BalanceWorkerHttpContext = {
		ownership: { findRuntime: () => undefined },
		partitionResolver: { partitionForIdentity: () => 0 },
		logger: {
			debug: () => {},
			info: () => {},
			warn: (...args: unknown[]) => {
				warnings.push(String(args[0]));
			},
			error: () => {},
		},
		chaos: {
			enabled,
			block: (ms) => {
				blocked.push(ms);
			},
		},
	};
	const app = createBalanceWorkerApp({ ctx });
	async function post(body: unknown): Promise<Response> {
		return app.request("/v1/debug/stall", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	}
	return { blocked, post, warnings };
}

async function nextTurns(): Promise<void> {
	for (let turn = 0; turn < 3; turn++)
		await new Promise<void>((resolve) => setTimeout(resolve, 10));
}

describe("stall hook", () => {
	test("is not routed at all when chaos is disabled", async () => {
		const app = createApp({ enabled: false });
		const response = await app.post({ ms: 1000 });
		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(response.status).not.toBe(202);
		await nextTurns();
		expect(app.blocked).toEqual([]);
	});

	test("answers before it blocks, then blocks the event loop for the requested time", async () => {
		const app = createApp({ enabled: true });
		const response = await app.post({ ms: 2500 });
		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({ stallMs: 2500 });
		expect(app.blocked).toEqual([]);
		await nextTurns();
		expect(app.blocked).toEqual([2500]);
		expect(app.warnings.some((line) => line.includes("2500"))).toBe(true);
	});

	test("refuses a missing, fractional, zero or over-cap duration", async () => {
		const app = createApp({ enabled: true });
		for (const body of [
			{},
			{ ms: 1.5 },
			{ ms: 0 },
			{ ms: -5 },
			{ ms: 120_001 },
			{ ms: "9" },
		]) {
			const response = await app.post(body);
			expect(response.status).toBe(400);
		}
		await nextTurns();
		expect(app.blocked).toEqual([]);
	});
});
