import { describe, expect, it } from "bun:test";
import { InternalError, RecaseError } from "@autumn/shared";
import { classifyError } from "../../../src/classify/classifyError.js";

describe("classifyError", () => {
	it("uses the first classifier that recognises the error", () => {
		const error = new RecaseError({ message: "Entity not found" });
		expect(classifyError({ error }).kind).toBe("expected");
	});

	it("falls back to bug for unrecognised errors, keeping their code", () => {
		const error = new InternalError({ message: "invariant", code: "broken" });
		expect(classifyError({ error })).toEqual({ kind: "bug", code: "broken" });
	});

	it("falls back to bug for plain errors and non-errors", () => {
		expect(classifyError({ error: new TypeError("undefined") })).toEqual({
			kind: "bug",
			code: undefined,
		});
		expect(classifyError({ error: "thrown string" }).kind).toBe("bug");
	});

	it("tries app classifiers before the built-in ones", () => {
		const error = new RecaseError({
			message: "Service unavailable",
			code: "service_unavailable",
			statusCode: 503,
		});
		const classifyAsInfra = () => ({ kind: "infra" as const });
		expect(classifyError({ error, classifiers: [classifyAsInfra] }).kind).toBe(
			"infra",
		);
	});

	it.each([29, 30, 31])(
		"keeps Kafka authorization error %s actionable instead of classifying it as transient infra",
		(code) => {
			const error = Object.assign(new Error("Kafka authorization failed"), {
				name: "KafkaJSProtocolError",
				retriable: false,
				code,
			});

			expect(classifyError({ error })).toEqual({
				kind: "bug",
				code: String(code),
			});
		},
	);

	it("does not treat Kafka authentication errors as transient infra", () => {
		const error = Object.assign(new Error("Authentication failed"), {
			name: "KafkaJSSASLAuthenticationError",
			retriable: false,
		});

		expect(classifyError({ error }).kind).toBe("bug");
		expect(
			classifyError({ error: new Error("Read failed", { cause: error }) }).kind,
		).toBe("bug");
	});

	it("retains transient Kafka protocol errors as infra", () => {
		const error = Object.assign(new Error("Leader unavailable"), {
			name: "KafkaJSProtocolError",
			retriable: true,
			code: 5,
		});

		expect(classifyError({ error })).toEqual({ kind: "infra", code: "5" });
	});

	it("classifies exhausted Kafka retries by their underlying dependency failure", () => {
		const cause = Object.assign(new Error("Connection failed"), {
			name: "KafkaJSConnectionError",
			retriable: true,
		});
		const error = Object.assign(new Error("Retries exhausted", { cause }), {
			name: "KafkaJSNumberOfRetriesExceeded",
			retriable: false,
		});

		expect(classifyError({ error }).kind).toBe("infra");
	});
});
