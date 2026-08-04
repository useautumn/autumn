import { describe, expect, it } from "bun:test";
import { raceFailOpen } from "@/honoMiddlewares/routeHandler.js";

const response = (label: string) => new Response(label);

describe("raceFailOpen", () => {
	it("returns the handler response when it beats the timer", async () => {
		const result = await raceFailOpen({
			run: async () => response("handler"),
			timeoutMs: 1_000,
			respond: () => response("fail-open"),
		});

		expect(await result.text()).toBe("handler");
	});

	it("returns the fail-open response when the handler is too slow", async () => {
		const result = await raceFailOpen({
			run: async () => {
				await Bun.sleep(200);
				return response("handler");
			},
			timeoutMs: 20,
			respond: () => response("fail-open"),
		});

		expect(await result.text()).toBe("fail-open");
	});

	it("a slow handler that later rejects does not crash the process", async () => {
		let settled = false;
		const result = await raceFailOpen({
			run: async () => {
				await Bun.sleep(50);
				settled = true;
				throw new Error("late failure after fail-open already responded");
			},
			timeoutMs: 10,
			respond: () => response("fail-open"),
		});

		expect(await result.text()).toBe("fail-open");
		// Let the abandoned run settle; an unhandled rejection would fail the suite.
		await Bun.sleep(80);
		expect(settled).toBe(true);
	});

	it("a fast rejection propagates instead of failing open", async () => {
		await expect(
			raceFailOpen({
				run: async () => {
					throw new Error("real error");
				},
				timeoutMs: 1_000,
				respond: () => response("fail-open"),
			}),
		).rejects.toThrow("real error");
	});
});
