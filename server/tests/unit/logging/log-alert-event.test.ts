import { describe, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { logAlertEvent } from "@/utils/logging/logAlertEvent.js";

describe("logAlertEvent", () => {
	test("emits the shared alert_event schema through ctx.logger", () => {
		const calls: unknown[][] = [];
		const ctx = {
			logger: {
				warn: (...args: unknown[]) => {
					calls.push(args);
				},
			},
		} as AutumnContext;

		logAlertEvent({
			ctx,
			severity: "warning",
			category: "redis",
			alertKey: "redis_full_subject_payload_large",
			message: "payload too large",
			source: "updateCachedCustomerData",
			component: "full_subject_cache",
			data: {
				payload_bytes: 123,
				threshold_bytes: 100,
			},
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]).toEqual([
			"payload too large",
			{
				type: "alert_event",
				alert_key: "redis_full_subject_payload_large",
				severity: "warning",
				category: "redis",
				source: "updateCachedCustomerData",
				component: "full_subject_cache",
				data: {
					payload_bytes: 123,
					threshold_bytes: 100,
				},
			},
		]);
	});
});
