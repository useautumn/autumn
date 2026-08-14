import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { buildDeductFromSubjectBalancesKeys } from "@/internal/customers/cache/fullSubject/builders/buildDeductFromSubjectBalancesKeys.js";

describe("buildDeductFromSubjectBalancesKeys", () => {
	test("declares the idempotency key before balance keys", () => {
		const { keys, balanceKeyIndexByFeatureId } =
			buildDeductFromSubjectBalancesKeys({
				orgId: "org_123",
				env: AppEnv.Sandbox,
				customerId: "cus_123",
				routingKey: "routing-key",
				lockReceiptKey: "lock-key",
				idempotencyKey: "idem-key",
				customerEntitlementDeductions: [
					{ feature_id: "messages" },
					{ feature_id: "emails" },
				],
				fallbackFeatureId: "messages",
			});

		expect(keys[0]).toBe("routing-key");
		expect(keys[1]).toBe("lock-key");
		expect(keys[2]).toBe("idem-key");
		expect(balanceKeyIndexByFeatureId.messages).toBe(4);
		expect(balanceKeyIndexByFeatureId.emails).toBe(5);
	});
});
