import { afterAll, expect, mock, test } from "bun:test";
import { MetadataType } from "@autumn/shared";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const calls: string[] = [];
const revertError = new Error("claim revert unavailable");
const claim = mock(async ({ fromType }: { fromType: MetadataType }) => {
	if (fromType === MetadataType.CheckoutSessionV2) {
		calls.push("claim");
		return {};
	}
	calls.push("revert");
	throw revertError;
});
await mockModuleWithRestore("@/internal/metadata/MetadataService", () => ({
	MetadataService: { claim },
}));
await mockModuleWithRestore(
	"@/external/redis/actions/checkoutSessionLock/checkoutSessionLock.js",
	() => ({
		checkoutSessionLock: {
			clearIfOwned: async () => {
				calls.push("clear");
			},
		},
	}),
);
const { withClaimedCheckoutSessionMetadata } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/withClaimedCheckoutSessionMetadata.js?revert-log"
);

test("labels a failed claim revert while rethrowing the execution error and clearing the reservation", async () => {
	const executionError = new Error("execution failed");
	const error = mock((..._args: unknown[]) => {
		calls.push("error");
	});
	const context = {
		db: {},
		org: { id: "org_123" },
		logger: { error },
	};
	const ctx = context as unknown as StripeWebhookContext;
	await expect(
		withClaimedCheckoutSessionMetadata({
			ctx,
			checkoutContext: {
				stripeCheckoutSession: { id: "checkout_123" },
			} as CheckoutSessionCompletedContext,
			metadata: {
				id: "metadata_123",
				type: MetadataType.CheckoutSessionV2,
				data: {
					billingContext: {
						fullCustomer: { id: "customer_123", org_id: "org_123" },
					},
				},
			} as NonNullable<CheckoutSessionCompletedContext["metadata"]>,
			execute: async () => {
				calls.push("execute");
				throw executionError;
			},
		}),
	).rejects.toBe(executionError);
	expect(calls).toEqual(["claim", "execute", "revert", "error", "clear"]);
	expect(error).toHaveBeenCalledTimes(1);
	expect(error).toHaveBeenCalledWith(
		"[checkout.completed] Failed to revert metadata claim for metadata_123",
		{ error_type: "checkout_metadata_claim_revert_failed", revertError },
	);
	expect(claim).toHaveBeenNthCalledWith(2, {
		db: ctx.db,
		id: "metadata_123",
		fromType: MetadataType.CheckoutSessionV2Processing,
		toType: MetadataType.CheckoutSessionV2,
	});
});

afterAll(() => {
	mock.restore();
});
