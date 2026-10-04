import { describe, expect, test } from "bun:test";
import { classifyServerCpuSample } from "../../src/profiling/serverCpu/classifyServerCpuSample.js";
import { createServerCpuSampler } from "../../src/profiling/serverCpu/createServerCpuSampler.js";
import type { ServerCpuBackend } from "../../src/profiling/serverCpu/types/serverCpuProfile.js";

describe("server CPU sampler", () => {
	for (const [bucket, bound] of [
		["autumn", true],
		["autumn-staging", false],
		["dev", true],
	] as const) {
		test(`does not start profiler timers or read clocks: ${bucket}, bound=${bound}`, async () => {
			const fail = () => {
				throw new Error(
					"Disabled telemetry touched a counter or profiler timer",
				);
			};
			const sampler = createServerCpuSampler({
				bucket,
				bound,
				backend: {
					readThreadCpuNs: fail,
					readProcessCpuUs: fail,
					now: fail,
					capture: fail,
				},
			});
			expect(sampler.enabled).toBe(false);
			sampler.startWindow();
			expect(await sampler.finishWindow()).toBeNull();
		});
	}
	test("arm A starts no capture", async () => {
		const fail = () => {
			throw new Error("Arm A must not profile");
		};
		const sampler = createServerCpuSampler({
			bucket: "autumn-staging",
			bound: true,
			shouldSample: () => false,
			backend: {
				readThreadCpuNs: fail,
				readProcessCpuUs: fail,
				now: fail,
				capture: fail,
			},
		});
		sampler.startWindow();
		expect(await sampler.finishWindow()).toBeNull();
	});
	test("weights disjoint samples by main-thread CPU, not wall time or helpers", async () => {
		let cpu = 0;
		let elapsed = 0;
		const backend: ServerCpuBackend = {
			readThreadCpuNs: () => cpu * 1e6,
			readProcessCpuUs: () => cpu * 2e3,
			now: () => elapsed,
			capture: async (run) => {
				await run();
				return {
					stackTraces: {
						interval: 0.001,
						traces: [
							{
								frames: [
									{
										sourceURL:
											"/app/server/src/internal/dev/apiKeys/actions/verifyKey.ts",
									},
								],
							},
							{
								frames: [
									{
										sourceURL:
											"/app/server/src/honoMiddlewares/requestLogging/logRequestResult.ts",
									},
								],
							},
						],
					},
				};
			},
		};
		const sampler = createServerCpuSampler({
			bucket: "autumn-staging",
			bound: true,
			backend,
		});
		sampler.startWindow();
		cpu = 20;
		elapsed = 10_000;
		const window = await sampler.finishWindow();
		expect(window?.phases.auth.estimatedCpuMs).toBe(10);
		expect(window?.phases.logging.estimatedCpuMs).toBe(10);
		expect(window?.otherThreadCpuMs).toBe(20);
		expect(window?.profiledWindowMs).toBe(10_000);
		expect(window?.gcCpuMs).toBeNull();
		expect(await sampler.finishWindow()).toBeNull();
	});
	test("unmapped application frames block attribution to an outer auth middleware", () => {
		expect(
			classifyServerCpuSample({
				frames: [
					{
						sourceURL:
							"/app/server/src/internal/balances/actions/businessLogic.ts",
					},
					{
						sourceURL: "/app/server/src/honoMiddlewares/secretKeyMiddleware.ts",
					},
				],
			}),
		).toBe("unattributed");
	});
	test("maps response encoding and native calls only through a known caller", () => {
		expect(
			classifyServerCpuSample({
				frames: [
					{ name: "stringify" },
					{ name: "json", sourceURL: "/app/node_modules/hono/dist/context.js" },
				],
			}),
		).toBe("serialization");
		expect(classifyServerCpuSample({ frames: [{ name: "stringify" }] })).toBe(
			"unattributed",
		);
	});
	test("separates RPC, routing and request redaction", () => {
		expect(
			classifyServerCpuSample({
				frames: [
					{
						sourceURL:
							"/app/packages/balance-worker-client/src/http/postJson.ts",
					},
				],
			}),
		).toBe("balanceWorkerClient");
		expect(
			classifyServerCpuSample({
				frames: [
					{
						sourceURL: "/app/server/src/honoMiddlewares/validatorMiddleware.ts",
					},
				],
			}),
		).toBe("routing");
		expect(
			classifyServerCpuSample({
				frames: [
					{
						name: "redactSensitiveRequestBody",
						sourceURL: "/app/server/src/honoMiddlewares/baseMiddleware.ts",
					},
				],
			}),
		).toBe("logging");
	});
	test("native GC without a resolvable caller stays unattributed", () => {
		expect(classifyServerCpuSample({ frames: [{ name: "GC" }] })).toBe(
			"unattributed",
		);
	});
	test("empty sample windows leave measured main-thread CPU unattributed", async () => {
		let cpu = 0;
		const sampler = createServerCpuSampler({
			bucket: "autumn-staging",
			bound: true,
			backend: {
				readThreadCpuNs: () => cpu,
				readProcessCpuUs: () => cpu / 1000,
				now: () => 0,
				capture: async (run) => {
					await run();
					return { stackTraces: { interval: 0.001, traces: [] } };
				},
			},
		});
		sampler.startWindow();
		cpu = 5e6;
		expect(
			(await sampler.finishWindow())?.phases.unattributed.estimatedCpuMs,
		).toBe(5);
	});
});
