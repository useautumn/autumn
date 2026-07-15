import type {
	SubscriptionMismatch,
	VerifyParamsV1,
	VerifyResponse,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupCustomerLicenseBillingContext } from "@/internal/billing/v2/setup/customerLicenseBillingContext/setupCustomerLicenseBillingContext";
import { computeExpectedSubscriptionState } from "./compute/computeExpectedSubscriptionState";
import { evaluateCancelState } from "./evaluate/evaluateCancelState";
import { evaluateItems } from "./evaluate/evaluateItems";
import { evaluateSchedulePhases } from "./evaluate/evaluateSchedulePhases";
import { setupVerifyContext } from "./setup/setupVerifyContext";

/**
 * Verifies that a customer's Stripe subscription(s) match the state Autumn expects from
 * their customer_products. Read-only: setup -> compute (expected state) -> evaluate (diff
 * against live Stripe) -> return. No execute stage, since verify never writes.
 */
export const verify = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: VerifyParamsV1;
}): Promise<VerifyResponse> => {
	const { customer_id: customerId, subscription_ids: subscriptionIdsFilter } =
		params;

	const { fullCustomer, targets } = await setupVerifyContext({
		ctx,
		customerId,
		subscriptionIdsFilter,
	});

	// Seat-snapshot specs need the license billing rows; free (in-memory gated)
	// for customers without licenses. TODO(licenses): fold into setupVerifyContext.
	const customerLicenseBillingContext =
		await setupCustomerLicenseBillingContext({ ctx, fullCustomer });

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const subscriptions: VerifyResponse["subscriptions"] = [];

	for (const target of targets) {
		const { stripeSubscriptionId, stripeSubscription, relatedCusProducts } =
			target;

		const {
			scenario,
			scheduledPhases,
			cancelAtSeconds,
			storedPriceCatalog,
			cusPriceCatalog,
		} = computeExpectedSubscriptionState({
			ctx,
			fullCustomer,
			relatedCusProducts,
			customerLicenseBillingContext,
		});

		const mismatches: SubscriptionMismatch[] = [];

		const firstPhase = scheduledPhases[0];
		if (firstPhase) {
			mismatches.push(
				...evaluateItems({
					expectedRawItems: firstPhase.items ?? [],
					actualSubscriptionItems: stripeSubscription.items.data,
					storedPriceCatalog,
					cusPriceCatalog,
				}),
			);
		}

		const cancelMismatch = await evaluateCancelState({
			stripeCli,
			sub: stripeSubscription,
			scenario,
			cancelAtSeconds,
		});
		if (cancelMismatch) mismatches.push(cancelMismatch);

		if (scenario === "multi_phase") {
			mismatches.push(
				...(await evaluateSchedulePhases({
					stripeCli,
					sub: stripeSubscription,
					scheduledPhases,
					storedPriceCatalog,
					cusPriceCatalog,
				})),
			);
		}

		subscriptions.push({
			stripe_subscription_id: stripeSubscriptionId,
			status: mismatches.length === 0 ? "correct" : "mismatched",
			mismatches,
		});
	}

	return { customer_id: customerId, subscriptions };
};
