import { describe, expect, it, mock } from "bun:test";
import { RecaseError } from "@autumn/shared";
import { reportError } from "../../../src/report/reportError.js";

const createLogger = () => ({ warn: mock(), error: mock() });

describe("reportError", () => {
	it("logs an expected error at warn with a low-cardinality message", () => {
		const logger = createLogger();
		const error = new RecaseError({ message: "Entity not found" });

		reportError({ ctx: { logger }, error, operation: "track" });

		expect(logger.warn).toHaveBeenCalledWith("track failed: Entity not found", {
			error,
		});
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("logs a bug at error, where the logger's hook sends it to Sentry", () => {
		const logger = createLogger();
		const error = new TypeError("Cannot read properties of undefined");

		reportError({ ctx: { logger }, error, operation: "GET /v1/boom/:id" });

		expect(logger.error).toHaveBeenCalledWith(
			"GET /v1/boom/:id failed: Cannot read properties of undefined",
			{ error },
		);
	});
});
