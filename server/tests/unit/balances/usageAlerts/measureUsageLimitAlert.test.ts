import { describe, expect, mock, test } from "bun:test";
import type { DbUsageAlert, Feature, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { measureUsageLimitAlert } from "@/internal/balances/usageAlerts/check/measure/measureUsageLimitAlert.js";

describe("measureUsageLimitAlert", () => {
	test("skips and logs when the deduction path carries no usage windows", () => {
		const info = mock(() => undefined);
		const ctx = {
			timestamp: Date.now(),
			logger: { info },
		} as unknown as AutumnContext;
		const fullCustomer = {} as FullCustomer;

		const measured = measureUsageLimitAlert({
			ctx,
			alert: {
				feature_id: "messages",
				basis: "usage_limit",
				threshold: 80,
				threshold_type: "usage_percentage",
				enabled: true,
			} as DbUsageAlert,
			feature: { id: "messages" } as Feature,
			tracked: { before: { fullCustomer }, after: { fullCustomer } },
		});

		expect(measured).toBeNull();
		expect(info).toHaveBeenCalledTimes(1);
	});
});
