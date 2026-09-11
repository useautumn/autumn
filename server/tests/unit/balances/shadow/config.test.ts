import { expect, test } from "bun:test";
import { parseBalanceShadowEdgeConfig } from "@/internal/balances/shadow/balanceShadowEdgeConfig.js";
import type { BalanceShadowConfig } from "@/internal/balances/shadow/balanceShadowTypes.js";
import { parseBalanceShadowConfig } from "@/internal/balances/shadow/parseBalanceShadowConfig.js";

const now = 1_800_000_000_000;
const config: BalanceShadowConfig = {
	runId: "trial-1",
	ownershipTopic: "trial-1-shadow-ownership",
	expiresAt: now + 3_600_000,
	customers: [
		{
			orgId: "org_test",
			env: "sandbox",
			customerId: "cus_test",
			featureId: "messages",
		},
	],
};

test("edge controls enforce the same bounded cohort and direct-routing isolation", () => {
	const run = { ...config, expiresAt: Date.now() + 60_000 };
	for (const input of [
		{ enabled: true, run: { ...run, customers: [] } },
		{
			enabled: true,
			run: { ...run, customers: [run.customers[0], run.customers[0]] },
		},
		{
			enabled: true,
			run: { ...run, ownershipTopic: "autumn-metering-ownership" },
		},
		{ enabled: true, run: { ...run, expiresAt: Date.now() + 86_400_100 } },
		{ enabled: false, run },
	])
		expect(() =>
			parseBalanceShadowEdgeConfig({ input, runtimeEnv: {} }),
		).toThrow();
	expect(() =>
		parseBalanceShadowEdgeConfig({
			input: { enabled: true, run },
			runtimeEnv: { BALANCE_WORKER_ROLLOUT_ENABLED: "true" },
		}),
	).toThrow("direct routing");
	expect(
		parseBalanceShadowEdgeConfig({
			input: { enabled: false },
			runtimeEnv: { BALANCE_WORKER_SHADOW: JSON.stringify(run) },
		}),
	).toBeUndefined();
});

test.concurrent(
	"shadow defaults off and permits an explicit expiring production cohort without direct routing",
	() => {
		expect(
			parseBalanceShadowConfig({ runtimeEnv: { NODE_ENV: "production" }, now }),
		).toBeUndefined();
		expect(
			parseBalanceShadowConfig({
				runtimeEnv: {
					NODE_ENV: "production",
					BALANCE_WORKER_SHADOW: JSON.stringify(config),
				},
				now,
			}),
		).toEqual(config);
	},
);

test.concurrent(
	"shadow requires a bounded valid cohort and a separate ownership topic",
	() => {
		for (const input of [
			{ ...config, customers: [] },
			{
				...config,
				customers: Array.from({ length: 21 }, () => config.customers[0]),
			},
			{ ...config, customers: [config.customers[0], config.customers[0]] },
			{ ...config, ownershipTopic: "autumn-metering-ownership" },
			{ ...config, expiresAt: now },
			{ ...config, expiresAt: now + 86_400_001 },
			{ ...config, extra: true },
		])
			expect(() =>
				parseBalanceShadowConfig({
					runtimeEnv: { BALANCE_WORKER_SHADOW: JSON.stringify(input) },
					now,
				}),
			).toThrow();
		expect(() =>
			parseBalanceShadowConfig({
				runtimeEnv: { BALANCE_WORKER_SHADOW: "bad json" },
				now,
			}),
		).toThrow();
	},
);

test.concurrent(
	"shadow and direct routing cannot address the same serving system",
	() => {
		for (const runtimeEnv of [
			{ BALANCE_WORKER_ROLLOUT_ENABLED: "true" },
			{ BALANCE_WORKER_OWNERSHIP_TOPIC: config.ownershipTopic },
		])
			expect(() =>
				parseBalanceShadowConfig({
					runtimeEnv: {
						...runtimeEnv,
						BALANCE_WORKER_SHADOW: JSON.stringify(config),
					},
					now,
				}),
			).toThrow();
	},
);

test.concurrent(
	"read-only comparison can inspect an expired run without re-enabling copying",
	() => {
		const runtimeEnv = {
			BALANCE_WORKER_SHADOW: JSON.stringify({ ...config, expiresAt: now - 1 }),
		};
		expect(() => parseBalanceShadowConfig({ runtimeEnv, now })).toThrow();
		expect(
			parseBalanceShadowConfig({ runtimeEnv, now, purpose: "inspect" }),
		).toMatchObject({ expiresAt: now - 1 });
		expect(() =>
			parseBalanceShadowConfig({
				runtimeEnv: { ...runtimeEnv, BALANCE_WORKER_ROLLOUT_ENABLED: "true" },
				now,
				purpose: "inspect",
			}),
		).toThrow();
	},
);
