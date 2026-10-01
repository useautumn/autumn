import { afterEach, expect, test } from "bun:test";
import { getCostRates, priceSandboxSeconds } from "./getCostRates.ts";

const ENV_KEYS = [
	"TW_MODAL_REGION",
	"TWD_MODAL_REGION_MULTIPLIER",
	"TWD_USD_PER_CORE_SECOND",
	"TWD_USD_PER_GIB_SECOND",
] as const;
const saved = Object.fromEntries(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);
afterEach(() => {
	for (const key of ENV_KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});
const clearEnv = () => {
	for (const key of ENV_KEYS) delete process.env[key];
};

test("defaults to Modal's sandbox rates, not the 3x cheaper function rates", () => {
	clearEnv();
	const rates = getCostRates();
	expect(rates.usdPerCoreSecond).toBe(0.00003942);
	expect(rates.usdPerGibSecond).toBe(0.00000667);
});

test("region multiplier follows the TW_MODAL_REGION pin the workers run under", () => {
	clearEnv();
	expect(getCostRates().regionMultiplier).toBe(1);
	process.env.TW_MODAL_REGION = "us-east-1";
	expect(getCostRates().regionMultiplier).toBe(1.75);
	process.env.TW_MODAL_REGION = "us";
	expect(getCostRates().regionMultiplier).toBe(1.15);
	process.env.TWD_MODAL_REGION_MULTIPLIER = "1.3";
	expect(getCostRates().regionMultiplier).toBe(1.3);
});

test("a 2-core 4 GiB worker-hour pinned to us-east-1 costs what Modal bills", () => {
	clearEnv();
	process.env.TW_MODAL_REGION = "us-east-1";
	const usd = priceSandboxSeconds({ seconds: 3600, cores: 2, memoryGib: 4 });
	expect(usd).toBeCloseTo(3600 * (2 * 0.00003942 + 4 * 0.00000667) * 1.75, 10);
	expect(usd).toBeCloseTo(0.6648, 4);
});
