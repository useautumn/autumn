import { describe, expect, test } from "bun:test";
import type { BillingContext, BillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan.js";

describe("executeBillingPlan lock ownership", () => {
	test("checks route lock ownership before entering the billing commit sequence", async () => {
		const ownershipError = new Error("lock ownership lost");
		let ownershipChecks = 0;
		const ctx = {
			assertLockOwned: () => {
				ownershipChecks++;
				throw ownershipError;
			},
		} as unknown as AutumnContext;

		await expect(
			executeBillingPlan({
				ctx,
				billingContext: {} as BillingContext,
				billingPlan: {} as BillingPlan,
			}),
		).rejects.toBe(ownershipError);
		expect(ownershipChecks).toBe(1);
	});

	test("uses an explicit worker ownership check before context state", async () => {
		const ownershipError = new Error("worker lock ownership lost");
		let contextOwnershipChecks = 0;
		let workerOwnershipChecks = 0;
		const ctx = {
			assertLockOwned: () => {
				contextOwnershipChecks++;
			},
		} as unknown as AutumnContext;

		await expect(
			executeBillingPlan({
				ctx,
				billingContext: {} as BillingContext,
				billingPlan: {} as BillingPlan,
				assertLockOwned: () => {
					workerOwnershipChecks++;
					throw ownershipError;
				},
			}),
		).rejects.toBe(ownershipError);
		expect(workerOwnershipChecks).toBe(1);
		expect(contextOwnershipChecks).toBe(0);
	});
});
