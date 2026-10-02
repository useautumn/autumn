import { describe, expect, test } from "bun:test";
import { RecaseError } from "@autumn/shared";
import { classifyInfraError } from "@/utils/logging/classifyInfraError.js";

const kindOf = (error: unknown) => classifyInfraError({ error })?.kind;

const workerError = (code: string, workerCode?: string) =>
	Object.assign(new Error("worker"), {
		name: "BalanceWorkerClientError",
		code,
		workerCode,
	});

describe("classifyInfraError", () => {
	test("transient pg errors and shed 503s are infra", () => {
		expect(kindOf(new Error("Query read timeout"))).toBe("infra");
		expect(
			kindOf(
				new RecaseError({
					message: "unavailable",
					code: "service_unavailable",
					statusCode: 503,
				}),
			),
		).toBe("infra");
	});

	test("balance worker unavailability is infra, its own verdicts are not", () => {
		expect(kindOf(workerError("DEADLINE"))).toBe("infra");
		expect(kindOf(workerError("WORKER_ERROR"))).toBeUndefined();
		expect(kindOf(workerError("WORKER_ERROR", "INTERNAL"))).toBeUndefined();
	});

	test("a partition mid-handoff is infra: the command was never submitted", () => {
		expect(kindOf(workerError("NO_OWNER"))).toBe("infra");
		expect(kindOf(workerError("ROUTE_STILL_STALE"))).toBe("infra");
		expect(kindOf(workerError("WORKER_ERROR", "NOT_READY"))).toBe("infra");
		expect(
			kindOf(
				new RecaseError({
					message: "not submitted",
					code: "balance_worker_unavailable",
					statusCode: 503,
				}),
			),
		).toBe("infra");
	});

	test("a worker command that may have applied stays a bug", () => {
		expect(
			kindOf(
				new RecaseError({
					message: "may have applied",
					code: "balance_worker_result_unknown",
					statusCode: 503,
				}),
			),
		).toBeUndefined();
	});

	test("our own errors stay out", () => {
		expect(kindOf(new TypeError("x is undefined"))).toBeUndefined();
		expect(
			kindOf(new RecaseError({ message: "nope", statusCode: 500 })),
		).toBeUndefined();
	});
});
