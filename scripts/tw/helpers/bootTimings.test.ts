import { beforeEach, expect, test } from "bun:test";
import {
	recordBootOutput,
	resetBootTraces,
	startBootTrace,
	summarizeBootTraces,
} from "./bootTimings.ts";

beforeEach(() => {
	resetBootTraces();
});

test("splits boot output into steps across chunk boundaries", () => {
	startBootTrace("worker-0");
	recordBootOutput({
		worker: "worker-0",
		text: "\u001b[36m[tw-boot] +5ms starting native services via start.sh\u001b[39m\n[tw-boot] +900ms native serv",
	});
	recordBootOutput({
		worker: "worker-0",
		text: "ices healthy\n[tw-boot] +1000ms reconciling node_modules (bun install --frozen-lockfile)\nnoise line\n",
	});
	recordBootOutput({
		worker: "worker-0",
		text: "[tw-boot] +4000ms applying pending DB migrations (schema self-heal)\n[tw-boot] +5000ms binding Stripe sub-account acct_1\n[tw-boot] +5100ms starting Autumn server (bun src/index.ts) on :8080\n[tw-boot] +11100ms server health OK on :8080\n",
	});

	const byStep = Object.fromEntries(
		summarizeBootTraces().map(({ step, stats }) => [step, stats.avg]),
	);

	expect(byStep["services up"]).toBe(895);
	expect(byStep["balance queue prep"]).toBe(100);
	expect(byStep["bun install"]).toBe(3000);
	expect(byStep["db migrate"]).toBe(1000);
	expect(byStep["stripe bind"]).toBe(100);
	expect(byStep["server load → health"]).toBe(6000);
	expect(byStep["exec → boot.ts running"]).toBeGreaterThanOrEqual(-5);
});

test("ignores workers without a started trace", () => {
	recordBootOutput({
		worker: "unknown",
		text: "[tw-boot] +5ms starting native services\n",
	});
	expect(summarizeBootTraces()).toEqual([]);
});
