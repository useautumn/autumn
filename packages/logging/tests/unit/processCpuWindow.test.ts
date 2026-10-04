import { expect, test } from "bun:test";
import { summarizeProcessCpuWindow } from "../../src/metrics/summarizeProcessCpuWindow.js";

test("per-fork CPU is measured in milliseconds and single-core equivalents", () => {
	expect(
		summarizeProcessCpuWindow({
			previous: { user: 100_000, system: 50_000 },
			current: { user: 2_100_000, system: 550_000 },
			windowMs: 10_000,
		}),
	).toEqual({
		cpuMs: 2500,
		cpuUserMs: 2000,
		cpuSystemMs: 500,
		cpuPct: 25,
		cpuCoreEquivalents: 0.25,
	});
});

test("native helper threads may use more than one core; CPU must not be clamped to 100%", () => {
	const result = summarizeProcessCpuWindow({
		previous: { user: 0, system: 0 },
		current: { user: 12_000_000, system: 500_000 },
		windowMs: 10_000,
	});
	expect(result.cpuCoreEquivalents).toBe(1.25);
	expect(result.cpuPct).toBe(125);
});

test("zero and invalid windows do not invent utilisation", () => {
	for (const windowMs of [0, -1, NaN, Infinity]) {
		const result = summarizeProcessCpuWindow({
			previous: { user: 0, system: 0 },
			current: { user: 1000, system: 1000 },
			windowMs,
		});
		expect(result.cpuCoreEquivalents).toBe(0);
		expect(result.cpuPct).toBe(0);
	}
});

test("preserves the server monitor's existing fractional-window CPU values", () => {
	const result = summarizeProcessCpuWindow({
		previous: { user: 1_000_000, system: 500_000 },
		current: { user: 4_250_500, system: 1_250_250 },
		windowMs: 10_000.4567,
	});
	expect(result).toEqual({
		cpuMs: 4000.75,
		cpuUserMs: 3250.5,
		cpuSystemMs: 750.25,
		cpuPct: 40.01,
		cpuCoreEquivalents: 0.400057,
	});
});
