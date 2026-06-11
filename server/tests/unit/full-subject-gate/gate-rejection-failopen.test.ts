import { describe, expect, test } from "bun:test";
import { AppEnv, RecaseError } from "@autumn/shared";
import {
	isFullSubjectGateRejection,
	runWithFullSubjectGate,
} from "@/internal/customers/repos/getFullSubject/getFullSubjectGate.js";
import { _setFullSubjectGateConfigForTesting } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";

describe("isFullSubjectGateRejection", () => {
	test("matches a rejection thrown by the real gate", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 1,
				per_org_limit: 1,
				max_wait_ms: 100,
				per_customer_pending_max: 1,
				per_org_pending_max: 1,
			},
		});

		const slow = () => new Promise((resolve) => setTimeout(resolve, 80));
		const results = await Promise.allSettled(
			Array.from({ length: 6 }, () =>
				runWithFullSubjectGate({
					customerId: "cus-predicate-real-gate",
					orgId: "org-predicate-real-gate",
					env: AppEnv.Live,
					queryFn: slow,
				}),
			),
		);

		const rejections = results.filter(
			(result) => result.status === "rejected",
		) as PromiseRejectedResult[];
		expect(rejections.length).toBeGreaterThan(0);
		for (const rejection of rejections) {
			expect(isFullSubjectGateRejection(rejection.reason)).toBe(true);
		}

		_setFullSubjectGateConfigForTesting({ config: {} });
	});
	test("matches the gate's rejection error", () => {
		const rejection = new RecaseError({
			message: "Too many concurrent requests for this customer.",
			code: "rate_limit_exceeded",
			statusCode: 429,
			data: { reason: "per_org_queue_full" },
		});
		expect(isFullSubjectGateRejection(rejection)).toBe(true);
	});

	test("does not match other RecaseErrors", () => {
		const serviceUnavailable = new RecaseError({
			message: "Service is temporarily unavailable, please retry shortly.",
			code: "service_unavailable",
			statusCode: 503,
		});
		expect(isFullSubjectGateRejection(serviceUnavailable)).toBe(false);

		const wrongStatus = new RecaseError({
			message: "rate limited",
			code: "rate_limit_exceeded",
			statusCode: 400,
		});
		expect(isFullSubjectGateRejection(wrongStatus)).toBe(false);
	});

	test("does not match plain errors or non-errors", () => {
		expect(isFullSubjectGateRejection(new Error("rate_limit_exceeded"))).toBe(
			false,
		);
		expect(isFullSubjectGateRejection(null)).toBe(false);
		expect(isFullSubjectGateRejection("rate_limit_exceeded")).toBe(false);
	});
});
