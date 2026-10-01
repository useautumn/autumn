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
});
