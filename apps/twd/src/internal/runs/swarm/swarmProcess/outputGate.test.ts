import { describe, expect, test } from "bun:test";
import { createOutputGate, isWorkerEchoLine } from "./outputGate.ts";

describe("createOutputGate", () => {
	test("forwards a worker's output only until it is serving", () => {
		const gate = createOutputGate();
		expect(gate.forwardWorker("w1")).toBe(true);
		gate.markServing("w1");
		expect(gate.forwardWorker("w1")).toBe(false);
		expect(gate.forwardWorker("w2")).toBe(true);
	});
});

describe("isWorkerEchoLine", () => {
	test("per-worker boot lines echoed through the log sink are dropped", () => {
		expect(
			isWorkerEchoLine(
				"\u001b[90m[tw-twd-run_abc-12] [tw-boot] +0ms starting\u001b[39m",
			),
		).toBe(true);
		expect(isWorkerEchoLine("[tw-twd-run_abc-12] server started")).toBe(true);
	});

	test("orchestrator lines are kept", () => {
		expect(isWorkerEchoLine("[modal] ✓ warm cache HIT")).toBe(false);
		expect(isWorkerEchoLine("cull: freed 12 idle worker(s)")).toBe(false);
	});
});
