import { describe, expect, test } from "bun:test";
import { RecaseError } from "@autumn/shared";
import { classifyInfraError } from "@/utils/logging/classifyInfraError.js";

const kindOf = (error: unknown) => classifyInfraError({ error })?.kind;

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
		const workerError = (code: string) =>
			Object.assign(new Error("worker"), {
				name: "BalanceWorkerClientError",
				code,
			});
		expect(kindOf(workerError("DEADLINE"))).toBe("infra");
		expect(kindOf(workerError("WORKER_ERROR"))).toBeUndefined();
	});

	test("our own errors stay out", () => {
		expect(kindOf(new TypeError("x is undefined"))).toBeUndefined();
		expect(
			kindOf(new RecaseError({ message: "nope", statusCode: 500 })),
		).toBeUndefined();
	});
});
