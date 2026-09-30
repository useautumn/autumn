import { describe, expect, it } from "bun:test";
import {
	CustomerNotFoundError,
	InternalError,
	RecaseError,
} from "@autumn/shared";
import { classifyRecaseError } from "../../../../src/classify/recase/classifyRecaseError.js";

describe("classifyRecaseError", () => {
	it("classifies a caller-facing RecaseError as expected, keeping its code", () => {
		const error = new RecaseError({
			message: "Entity not found",
			code: "invalid_inputs",
		});
		expect(classifyRecaseError({ error })).toEqual({
			kind: "expected",
			code: "invalid_inputs",
		});
	});

	it("classifies a RecaseError subclass as expected", () => {
		const error = new CustomerNotFoundError({ customerId: "customer_123" });
		expect(classifyRecaseError({ error })?.kind).toBe("expected");
	});

	it("classifies a 5xx RecaseError as a bug", () => {
		const error = new RecaseError({ message: "Redis down", statusCode: 503 });
		expect(classifyRecaseError({ error })?.kind).toBe("bug");
	});

	it("does not recognise errors that are not RecaseErrors", () => {
		const error = new InternalError({ message: "invariant" });
		expect(classifyRecaseError({ error })).toBeUndefined();
	});
});
