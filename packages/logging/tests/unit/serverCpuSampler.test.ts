import { describe, expect, test } from "bun:test";
import { classifyServerCpuSample } from "../../src/profiling/serverCpu/classifyServerCpuSample.js";
import { createServerCpuSampler } from "../../src/profiling/serverCpu/createServerCpuSampler.js";
import type { ServerCpuBackend } from "../../src/profiling/serverCpu/types/serverCpuProfile.js";

describe("server CPU sampler", () => {
	test.skipIf(process.platform !== "linux")(
		"real thread CPU excludes an awaited idle period",
		async () => {
			const { getServerCpuBackend } = await import(
				"../../src/profiling/serverCpu/serverCpuRuntime.js"
			);
			const sampler = createServerCpuSampler({
				bucket: "autumn-staging",
				bound: true,
				backend: getServerCpuBackend(),
			});
			sampler.startWindow();
			const until = performance.now() + 120;
			let value = 0;
			while (performance.now() < until) value += Math.sqrt(Math.random());
			await new Promise((resolve) => setTimeout(resolve, 180));
			const window = await sampler.finishWindow();
			expect(value).toBeGreaterThan(0);
			expect(window?.samples).toBeGreaterThan(0);
			expect(window?.mainThreadCpuMs).toBeGreaterThan(0);
			expect(window!.mainThreadCpuMs).toBeLessThan(
				window!.profiledWindowMs - 100,
			);
			expect(window?.sampleIntervalUs).toBe(50_000);
		},
	);
	test("a failed closing clock still releases the profiler", async () => {
		let failed = false;
		let released = false;
		const sampler = createServerCpuSampler({
			bucket: "autumn-staging",
			bound: true,
			backend: {
				readThreadCpuNs: () => {
					if (failed) throw new Error("clock failed");
					return 0;
				},
				readProcessCpuUs: () => 0,
				now: () => 0,
				capture: async (run) => {
					await run();
					released = true;
					return { stackTraces: { interval: 0.001, traces: [] } };
				},
			},
		});
		sampler.startWindow();
		failed = true;
		expect(await sampler.finishWindow()).toBeNull();
		expect(released).toBe(true);
	});
	test("profiler failures cannot escape telemetry or retry on the hot path", async () => {
		let attempts = 0;
		const sampler = createServerCpuSampler({
			bucket: "autumn-staging",
			bound: true,
			backend: {
				readThreadCpuNs: () => 0,
				readProcessCpuUs: () => 0,
				now: () => 0,
				capture: () => {
					attempts++;
					throw new Error("profiler failed");
				},
			},
		});
		expect(() => sampler.startWindow()).not.toThrow();
		expect(await sampler.finishWindow()).toBeNull();
		sampler.startWindow();
		expect(attempts).toBe(1);
	});
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
		expect(window?.phases.serialization.estimatedCpuMs).toBeNull();
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
