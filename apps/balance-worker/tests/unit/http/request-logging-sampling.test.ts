import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { requestLoggingMiddleware } from "../../../src/http/middlewares/requestLoggingMiddleware.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
} from "../../../src/http/types/balanceWorkerHttp.js";
import {
	OwnedPartitionNotReadyError,
	OwnedPartitionRecoveryRequiredError,
} from "../../../src/runtime/runtimeErrors.js";

function createApp({ successSampleRate }: { successSampleRate?: number }) {
	const lines: { level: string; message: string }[] = [];
	const record = (level: string) => (_event: unknown, message: string) => {
		lines.push({ level, message });
	};
	const ctx = {
		ownership: { findRuntime: () => undefined },
		partitionResolver: { partitionForIdentity: () => 0 },
		logger: {
			debug: record("debug"),
			info: record("info"),
			warn: record("warn"),
			error: record("error"),
		},
		...(successSampleRate === undefined
			? {}
			: { requestLog: { successSampleRate } }),
	} as unknown as BalanceWorkerHttpContext;
	const app = new Hono<BalanceWorkerHttpEnv>();
	app.use(requestLoggingMiddleware({ ctx }));
	app.post("/ok", (c) => c.json({ ok: true }));
	app.post("/batch-with-failure", (c) => {
		c.get("requestLog").batch = {
			route: { partition: 0, routeEpoch: "1" },
			count: 2,
			succeeded: 1,
			failed: 1,
			errorCodes: { OVERLOADED: 1 },
			worstStatus: 200,
		} as never;
		return c.json({ ok: true });
	});
	app.post("/refused", (c) => c.json({ error: { code: "NOT_READY" } }, 503));
	app.post("/activating", (c) => {
		c.get("requestLog").error = new OwnedPartitionNotReadyError({
			status: "activating",
		});
		return c.json({ error: { code: "NOT_READY" } }, 503);
	});
	app.post("/not-ready-recovery", (c) => {
		c.get("requestLog").error = new OwnedPartitionNotReadyError({
			status: "recovery_required",
		});
		return c.json({ error: { code: "NOT_READY" } }, 503);
	});
	app.post("/recovery", (c) => {
		c.get("requestLog").error = new OwnedPartitionRecoveryRequiredError({
			topic: "commands",
			partition: 0,
			cause: new Error("Recovery failed"),
		});
		return c.json({ error: { code: "INTERNAL" } }, 503);
	});
	app.post("/batch-with-activation-and-recovery", (c) => {
		c.get("requestLog").error = new OwnedPartitionNotReadyError({
			status: "activating",
		});
		c.get("requestLog").batch = {
			route: { partition: 0, routeEpoch: "1" },
			count: 2,
			succeeded: 0,
			failed: 2,
			errorCodes: { NOT_READY: 1, INTERNAL: 1 },
			worstStatus: 503,
		};
		return c.json({ ok: true });
	});
	return { app, lines };
}

async function hit(
	app: Hono<BalanceWorkerHttpEnv>,
	path: string,
	times: number,
) {
	for (let index = 0; index < times; index++)
		await app.request(path, { method: "POST" });
}

describe("request log sampling", () => {
	test("without a rate every request is logged, as before", async () => {
		const { app, lines } = createApp({});
		await hit(app, "/ok", 20);
		expect(lines.filter((line) => line.level === "info")).toHaveLength(20);
	});

	test("at rate zero no success is logged, but failures and failing batches still are", async () => {
		const { app, lines } = createApp({ successSampleRate: 0 });
		await hit(app, "/ok", 50);
		await hit(app, "/refused", 3);
		await hit(app, "/batch-with-failure", 2);
		expect(lines.filter((line) => line.level === "info")).toHaveLength(2);
		expect(lines.filter((line) => line.level === "error")).toHaveLength(3);
		expect(lines.filter((line) => line.message.includes("/ok"))).toHaveLength(
			0,
		);
	});

	test("at rate one every success is logged", async () => {
		const { app, lines } = createApp({ successSampleRate: 1 });
		await hit(app, "/ok", 20);
		expect(lines.filter((line) => line.level === "info")).toHaveLength(20);
	});

	test("an activating partition answering 503 is still logged as a warning with sampling disabled", async () => {
		const { app, lines } = createApp({ successSampleRate: 0 });
		await hit(app, "/activating", 2);
		expect(lines.map((line) => line.level)).toEqual(["warn", "warn"]);
	});

	test("partition recovery failures remain errors", async () => {
		const { app, lines } = createApp({});
		await hit(app, "/not-ready-recovery", 1);
		await hit(app, "/recovery", 1);
		expect(lines.map((line) => line.level)).toEqual(["error", "error"]);
	});

	test("a batch with activation and recovery failures remains an error", async () => {
		const { app, lines } = createApp({ successSampleRate: 0 });
		await hit(app, "/batch-with-activation-and-recovery", 1);
		expect(lines.map((line) => line.level)).toEqual(["error"]);
	});
});
