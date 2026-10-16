import { describe, expect, test } from "bun:test";
import type { BillingContext, BillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkBillingApproval } from "@/internal/approvals/check/checkBillingApproval";
import { withApprovalSkipped } from "@/internal/approvals/check/withApprovalSkipped";

const memberCtx = () =>
	({
		userId: "user_1",
		role: "sales",
		org: { config: { approvals_enforced: false } },
		testOptions: { includePermissionFacts: true },
	}) as unknown as AutumnContext;

describe("withApprovalSkipped", () => {
	test("system work inside a member's request builds no facts and reaches no rule", async () => {
		const ctx = memberCtx();
		const outcome = await withApprovalSkipped({
			ctx,
			run: () =>
				checkBillingApproval({
					ctx,
					billingContext: {
						cancelAction: "cancel_immediately",
					} as BillingContext,
					billingPlan: {} as BillingPlan,
					route: "billing.update",
					preview: true,
				}),
		});
		expect(outcome).toEqual({ action: "billing.cancel", enforced: false });
	});

	test("the request's own context comes back as it was, even when the work throws", async () => {
		const ctx = memberCtx();
		await withApprovalSkipped({ ctx, run: async () => undefined });
		expect(ctx.skipApproval).toBeUndefined();

		await expect(
			withApprovalSkipped({
				ctx,
				run: async () => {
					throw new Error("boom");
				},
			}),
		).rejects.toThrow("boom");
		expect(ctx.skipApproval).toBeUndefined();
	});

	test("mutations the work makes to the context stay on the request", async () => {
		const ctx = memberCtx();
		await withApprovalSkipped({
			ctx,
			run: async () => {
				ctx.skipSubjectCacheDeletion = true;
			},
		});
		expect(ctx.skipSubjectCacheDeletion).toBe(true);
	});
});
