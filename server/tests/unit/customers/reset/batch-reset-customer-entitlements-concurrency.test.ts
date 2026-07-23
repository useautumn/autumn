import { describe, expect, spyOn, test } from "bun:test";
import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchResetCustomerEntitlements } from "@/internal/customers/actions/resetCustomerEntitlements/batchResetCustomerEntitlements.js";
import { CusService } from "@/internal/customers/CusService.js";

describe("batchResetCustomerEntitlements", () => {
	test("limits concurrent customer rehydrations to five", async () => {
		let activeRehydrations = 0;
		let maximumConcurrentRehydrations = 0;

		const getFullSpy = spyOn(CusService, "getFull").mockImplementation(
			async () => {
				activeRehydrations++;
				maximumConcurrentRehydrations = Math.max(
					maximumConcurrentRehydrations,
					activeRehydrations,
				);

				await new Promise((resolve) => setTimeout(resolve, 5));
				activeRehydrations--;
				return {} as FullCustomer;
			},
		);

		try {
			await batchResetCustomerEntitlements({
				ctx: {} as AutumnContext,
				payload: {
					orgId: "org_test",
					env: "sandbox",
					resets: Array.from({ length: 20 }, (_, index) => ({
						internalCustomerId: `internal_customer_${index}`,
						customerId: `customer_${index}`,
						cusEntIds: [`customer_entitlement_${index}`],
					})),
				},
			});

			expect(getFullSpy).toHaveBeenCalledTimes(20);
			expect(maximumConcurrentRehydrations).toBe(5);
		} finally {
			getFullSpy.mockRestore();
		}
	});
});
