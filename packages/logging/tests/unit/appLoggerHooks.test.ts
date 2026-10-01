import { describe, expect, it } from "bun:test";
import { createAppLogger } from "../../src/logger/autumnLogger.js";

describe("createAppLogger hooks", () => {
	it("hands hooks the raw Error, whichever way it was logged", () => {
		const seen: unknown[][] = [];
		const logger = createAppLogger({
			service: "test",
			outputs: ["console-json"],
			hooks: {
				logMethod(args, method) {
					seen.push(args);
					method.apply(this, args);
				},
			},
		});
		const error = new Error("boom");

		logger.error(error);
		logger.error({ error, data: { id: 1 } }, "failed");

		expect((seen[0]?.[0] as { error: unknown }).error).toBe(error);
		expect((seen[1]?.[0] as { error: unknown }).error).toBe(error);
	});
});
