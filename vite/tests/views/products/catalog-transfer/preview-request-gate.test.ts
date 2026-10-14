import { describe, expect, test } from "bun:test";
import { createRequestGate } from "../../../../src/views/products/catalog-transfer/utils/requestGate";

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

describe("preview request gate", () => {
	test("returns the response of the latest request", async () => {
		const gate = createRequestGate();
		const outcome = await gate.run(async () => "preview");
		expect(outcome).toEqual({ status: "current", value: "preview" });
	});

	test("drops a response that lands after the JSON was edited or the dialog closed", async () => {
		const gate = createRequestGate();
		const request = deferred<string>();
		const pending = gate.run(() => request.promise);
		gate.invalidate();
		request.resolve("old preview");
		expect(await pending).toEqual({ status: "stale" });
	});

	test("drops an earlier request superseded by a newer preview", async () => {
		const gate = createRequestGate();
		const first = deferred<string>();
		const firstOutcome = gate.run(() => first.promise);
		const secondOutcome = gate.run(async () => "new preview");
		first.resolve("old preview");
		expect(await firstOutcome).toEqual({ status: "stale" });
		expect(await secondOutcome).toEqual({
			status: "current",
			value: "new preview",
		});
	});

	test("drops a stale failure instead of surfacing its error", async () => {
		const gate = createRequestGate();
		const request = deferred<string>();
		const pending = gate.run(() => request.promise);
		gate.invalidate();
		request.reject(new Error("boom"));
		expect(await pending).toEqual({ status: "stale" });
	});
});
