import { expect, mock, test } from "bun:test";
import { AppEnv, type Metadata } from "@autumn/shared";
import Stripe from "stripe";
import type { RepoContext } from "@/db/repoContext.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const metadataUpdates: { id: string; updates: { expires_at: number } }[] = [];

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
	MetadataService: {
		get: async () => ({ id: "meta_123" }),
		update: async (params: { id: string; updates: { expires_at: number } }) => {
			metadataUpdates.push(params);
		},
	},
}));

const { expirePendingPlanAtDueDate } = await import(
	"@/internal/billing/v2/actions/expirePendingPlan/expirePendingPlanAtDueDate.js"
);

const runExpiryWithVoidError = async (voidError: Error) => {
	metadataUpdates.length = 0;
	const voidInvoice = mock(async () => {
		throw voidError;
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

	return { voidInvoice, logger };
};

test("pending plan expiry failures have an error_type and retain the original cause", async () => {
	const { voidInvoice, logger } = await runExpiryWithVoidError(
		new Error("invoice operation failed"),
	);

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

test("pending plan expiry failures log the Stripe error code and type", async () => {
	const { logger } = await runExpiryWithVoidError(
		new Stripe.errors.StripeInvalidRequestError({
			message: "Invoices with `paid` payments cannot be voided.",
			type: "invalid_request_error",
			code: "invoice_not_editable",
		}),
	);

	expect(logger.error).toHaveBeenCalledTimes(1);
	expect(logger.error.mock.calls[0]?.[1]).toEqual({
		error_type: "pending_plan_expiry_failed",
		stripe_error_code: "invoice_not_editable",
		stripe_error_type: "StripeInvalidRequestError",
	});
});

test("a still-pending payment defers expiry a day instead of failing", async () => {
	const startedAt = Date.now();
	const { logger } = await runExpiryWithVoidError(
		new Stripe.errors.StripeInvalidRequestError({
			message:
				"This invoice can't be modified while a payment on it is still pending. Wait for the payment to clear, then try again.",
			type: "invalid_request_error",
		}),
	);

	expect(logger.error).not.toHaveBeenCalled();
	expect(metadataUpdates).toHaveLength(1);
	expect(metadataUpdates[0]?.id).toBe("meta_123");
	expect(metadataUpdates[0]?.updates.expires_at).toBeGreaterThan(
		startedAt + 23 * 60 * 60 * 1000,
	);
});
