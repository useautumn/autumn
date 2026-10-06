import { afterEach, expect, test } from "bun:test";
import { getCostRates, priceSandboxSeconds } from "./getCostRates.ts";

const ENV_KEYS = [
	"TW_MODAL_REGION",
	"TWD_MODAL_REGION_MULTIPLIER",
	"TWD_USD_PER_CORE_SECOND",
	"TWD_USD_PER_GIB_SECOND",
	"TW_MODAL_WORKER_CPU",
	"TW_MODAL_WORKER_MEM_MIB",
] as const;
const saved = Object.fromEntries(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);
const clearEnv = () => {
	for (const key of ENV_KEYS) delete process.env[key];
};
afterEach(() => {
	for (const key of ENV_KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});

test("defaults to Modal's Sandbox rates, 3x the Function rates", () => {
	clearEnv();
	const rates = getCostRates();
	expect(rates.usdPerCoreSecond).toBe(0.00003942);
	expect(rates.usdPerGibSecond).toBe(0.00000667);
	expect(rates.usdPerCoreSecond / 0.0000131).toBeCloseTo(3, 1);
	expect(rates.usdPerGibSecond / 0.00000222).toBeCloseTo(3, 1);
});

test("region multiplier follows scripts/tw's pin, us-east-1 by default", () => {
	clearEnv();
	expect(getCostRates().regionMultiplier).toBe(1.75);
	process.env.TW_MODAL_REGION = "us";
	expect(getCostRates().regionMultiplier).toBe(1.15);
	process.env.TW_MODAL_REGION = "eu-west-2";
	expect(getCostRates().regionMultiplier).toBe(1.75);
	process.env.TW_MODAL_REGION = "ap";
	expect(getCostRates().regionMultiplier).toBe(1.15);
});

test("a blank override falls back to the default instead of pricing at $0", () => {
	clearEnv();
	process.env.TWD_MODAL_REGION_MULTIPLIER = "";
	process.env.TWD_USD_PER_CORE_SECOND = "";
	expect(getCostRates()).toMatchObject({
		usdPerCoreSecond: 0.00003942,
		regionMultiplier: 1.75,
	});
});

test("every rate stays overridable per deploy", () => {
	clearEnv();
	process.env.TWD_USD_PER_CORE_SECOND = "0.00002";
	process.env.TWD_USD_PER_GIB_SECOND = "0.000003";
	process.env.TWD_MODAL_REGION_MULTIPLIER = "1";
	expect(getCostRates()).toMatchObject({
		usdPerCoreSecond: 0.00002,
		usdPerGibSecond: 0.000003,
		regionMultiplier: 1,
	});
	expect(priceSandboxSeconds({ seconds: 10, cores: 2, memoryGib: 4 })).toBe(
		10 * (2 * 0.00002 + 4 * 0.000003),
	);
});

test("a default 2-core 4 GiB worker-hour costs $0.66, not the old $0.13", () => {
	clearEnv();
	const { workerCores, workerMemoryGib } = getCostRates();
	const usd = priceSandboxSeconds({
		seconds: 3600,
		cores: workerCores,
		memoryGib: workerMemoryGib,
	});
	expect(usd).toBeCloseTo(3600 * (2 * 0.00003942 + 4 * 0.00000667) * 1.75, 10);
	expect(usd).toBeCloseTo(0.6648, 4);
});

test("Oct 1 01:00 nightly baseline: 643,199 worker-seconds price within 15% of Modal's $118.11", () => {
	clearEnv();
	const { workerCores, workerMemoryGib } = getCostRates();
	const usd = priceSandboxSeconds({
		seconds: 643_199,
		cores: workerCores,
		memoryGib: workerMemoryGib,
	});
	expect(Math.abs(usd - 118.11) / 118.11).toBeLessThan(0.02);
});
