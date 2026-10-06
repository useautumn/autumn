import { expect, mock, test } from "bun:test";
import { AppEnv, type Metadata } from "@autumn/shared";
import type Stripe from "stripe";
import type { RepoContext } from "@/db/repoContext.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

await mockModuleWithRestore("@/external/redis/resolveRedisV2.js", () => ({
	resolveRedisV2: () => ({}),
}));

await mockModuleWithRestore(
	"@/internal/billing/v2/execute/withDeferredBillingPlanLock.js",
	() => ({
		withDeferredBillingPlanLock: ({ fn }: { fn: () => Promise<unknown> }) =>
			fn(),
	}),
);
await mockModuleWithRestore("@/internal/metadata/MetadataService.js", () => ({
	MetadataService: { get: async () => ({ id: "meta_123" }) },
}));

const { expirePendingPlanAtDueDate } = await import(
	"@/internal/billing/v2/actions/expirePendingPlan/expirePendingPlanAtDueDate.js"
);

test("pending plan expiry failures have an error_type and retain the original cause", async () => {
	const voidInvoice = mock(async () => {
		throw new Error("invoice operation failed");
	});
	const invoices: Pick<Stripe["invoices"], "voidInvoice"> = { voidInvoice };
	const stripeCli: Partial<Stripe> = {
		invoices: invoices as Stripe["invoices"],
	};
	const stripeInvoice: Partial<Stripe.Invoice> = {
		id: "in_123",
		status: "open",
		amount_paid: 0,
	};
	const logger = {
		error: mock(),
		warn: mock(),
		info: mock(),
		debug: mock(),
		child: mock(),
	};

	await expirePendingPlanAtDueDate({
		ctx: { db: {} as RepoContext["db"], logger },
		orgId: "org_123",
		env: AppEnv.Sandbox,
		stripeCli: stripeCli as Stripe,
		stripeInvoice: stripeInvoice as Stripe.Invoice,
		metadata: { id: "meta_123" } as Metadata,
	});

	expect(voidInvoice).toHaveBeenCalledTimes(1);
	expect(voidInvoice).toHaveBeenCalledWith("in_123");
	expect(logger.error).toHaveBeenCalledTimes(1);
	expect(logger.error).toHaveBeenCalledWith(
		"[expirePendingPlanAtDueDate] Failed for invoice in_123; retrying next run: Error: invoice operation failed",
		{ error_type: "pending_plan_expiry_failed" },
	);
	expect(logger.warn).not.toHaveBeenCalled();
	expect(logger.info).not.toHaveBeenCalled();
});
