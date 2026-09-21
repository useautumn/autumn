import { describe, expect, it } from "bun:test";
import {
	errorToObject,
	normalizeErrorValues,
} from "../../src/logger/normalizeErrors.js";

/** An Error keeps message, stack and cause on non-enumerable properties, so a
 *  log payload carrying one serialises to `{}` and the line reaches Axiom with
 *  no sign of what failed. */
describe("normalizeErrorValues", () => {
	it("rescues an error that JSON would render as an empty object", () => {
		const error = new Error("boom");
		expect(JSON.stringify({ error })).toBe('{"error":{}}');

		const normalized = normalizeErrorValues({ error }) as {
			error: { name: string; message: string; stack?: string };
		};
		expect(normalized.error.message).toBe("boom");
		expect(normalized.error.name).toBe("Error");
		expect(normalized.error.stack).toContain("boom");
	});

	it("keeps the cause, which is where the real failure usually is", () => {
		const root = new Error("Applied position has no matching receipt");
		const wrapped = new Error("Partition writer requires recovery", {
			cause: root,
		});

		const normalized = errorToObject(wrapped) as {
			message: string;
			cause: { message: string };
		};
		expect(normalized.message).toBe("Partition writer requires recovery");
		expect(normalized.cause.message).toBe(
			"Applied position has no matching receipt",
		);
	});

	it("reaches errors buried in objects and arrays", () => {
		const normalized = normalizeErrorValues({
			data: { causes: [new Error("nested")] },
		}) as { data: { causes: { message: string }[] } };
		expect(normalized.data.causes[0].message).toBe("nested");
	});

	it("leaves values that are not errors exactly as they were", () => {
		const payload = { error: "already a string", route: { partition: 366 } };
		expect(normalizeErrorValues(payload)).toBe(payload);
	});

	it("stops walking a cause chain rather than following it forever", () => {
		let error = new Error("depth-0");
		for (let depth = 1; depth <= 12; depth += 1)
			error = new Error(`depth-${depth}`, { cause: error });

		let node = errorToObject(error) as { cause?: Record<string, unknown> };
		let seen = 0;
		while (node.cause) {
			node = node.cause as { cause?: Record<string, unknown> };
			seen += 1;
		}
		expect(seen).toBeLessThanOrEqual(5);
	});
});
