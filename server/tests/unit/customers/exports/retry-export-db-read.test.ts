import { describe, expect, it } from "bun:test";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { retryExportDbRead } from "@/internal/customers/exports/verify/retryExportDbRead.js";

const loggerSpy = () => {
	const warnings: { operation?: string; attempt?: number }[] = [];
	const logger = {
		warn: (_message: string, payload?: { data?: Record<string, unknown> }) => {
			warnings.push(payload?.data ?? {});
		},
	} as unknown as Logger;
	return { logger, warnings };
};

const FAST = { retryDelayMs: 0, maxRetryDelayMs: 0, timeoutMs: 1_000 };

describe("retryExportDbRead", () => {
	it("rides out a dead connection and returns the recovered read", async () => {
		const { logger, warnings } = loggerSpy();
		let calls = 0;
		const getCustomerExportScalars = async ({ limit }: { limit: number }) => {
			calls++;
			if (calls < 3) throw new Error("Connection terminated unexpectedly");
			return [{ limit }];
		};

		const read = retryExportDbRead({
			logger,
			operation: "getCustomerExportScalars",
			query: getCustomerExportScalars,
			limits: FAST,
		});

		expect(await read({ limit: 5 })).toEqual([{ limit: 5 }]);
		expect(calls).toBe(3);
		expect(warnings.map((warning) => warning.operation)).toEqual([
			"getCustomerExportScalars",
			"getCustomerExportScalars",
		]);
	});

	it("surfaces the failure once the budget is spent", async () => {
		const { logger } = loggerSpy();
		const getStripeLinkedCustomerIds = async () => {
			throw new Error("Connection terminated unexpectedly");
		};

		const read = retryExportDbRead({
			logger,
			operation: "getStripeLinkedCustomerIds",
			query: getStripeLinkedCustomerIds,
			limits: FAST,
		});

		await expect(read(undefined)).rejects.toThrow(/Connection terminated/);
	});
});
