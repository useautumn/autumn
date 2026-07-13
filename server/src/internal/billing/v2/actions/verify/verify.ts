import type {
	SubscriptionMismatch,
	VerifyParamsV1,
	VerifyResponse,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeExpectedSubscriptionState } from "./compute/computeExpectedSubscriptionState";
import { evaluateCancelState } from "./evaluate/evaluateCancelState";
import { evaluateItems } from "./evaluate/evaluateItems";
import { evaluateSchedulePhases } from "./evaluate/evaluateSchedulePhases";
import { verifyMismatchToMessage } from "./format/verifyMismatchToMessage";
import {
	setupVerifyContext,
	type VerifyPrefetched,
} from "./setup/setupVerifyContext";

const stampMessages = (
	mismatches: SubscriptionMismatch[],
): SubscriptionMismatch[] =>
	mismatches.map((mismatch) => ({
		...mismatch,
		message: mismatch.message ?? verifyMismatchToMessage(mismatch),
	}));

/**
 * Verifies that a customer's Stripe subscription(s) match the state Autumn expects from
 * their customer_products. Read-only: setup -> compute (expected state) -> evaluate (diff
 * against live Stripe) -> return. No execute stage, since verify never writes.
 */
export const verify = async ({
	ctx,
	params,
	prefetched,
}: {
	ctx: AutumnContext;
	params: VerifyParamsV1;
	prefetched?: VerifyPrefetched;
}): Promise<VerifyResponse> => {
	const {
		customer_id: customerId,
		subscription_ids: subscriptionIdsFilter,
		strict,
	} = params;

	const {
		fullCustomer,
		targets,
		unlinkedSubscriptions,
		activeSubscriptionIds,
	} = await setupVerifyContext({
		ctx,
		customerId,
		subscriptionIdsFilter,
		prefetched,
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const subscriptions: VerifyResponse["subscriptions"] = [];

	for (const unlinkedSubscription of unlinkedSubscriptions) {
		subscriptions.push({
			stripe_subscription_id: unlinkedSubscription.id,
			status: "mismatched",
			mismatches: stampMessages([{ type: "subscription_not_linked" }]),
		});
	}

	for (const target of targets) {
		const { stripeSubscriptionId, stripeSubscription, relatedCusProducts } =
			target;

		const mismatches: SubscriptionMismatch[] = [];

		if (
			activeSubscriptionIds &&
			!activeSubscriptionIds.has(stripeSubscriptionId)
		) {
			mismatches.push({ type: "stale_subscription_link" });
		}

		// An unrenderable expected state (e.g. a price with no Stripe link) is a
		// finding for THIS subscription, never a failure of the whole verify.
		try {
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
			});

			const firstPhase = scheduledPhases[0];
			if (firstPhase) {
				mismatches.push(
					...evaluateItems({
						expectedRawItems: firstPhase.items ?? [],
						actualSubscriptionItems: stripeSubscription.items.data,
						storedPriceCatalog,
						cusPriceCatalog,
						strict,
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
						strict,
					})),
				);
			}
		} catch (error) {
			mismatches.push({
				type: "expected_state_error",
				error: error instanceof Error ? error.message : String(error),
			});
		}

		subscriptions.push({
			stripe_subscription_id: stripeSubscriptionId,
			status: mismatches.length === 0 ? "correct" : "mismatched",
			mismatches: stampMessages(mismatches),
		});
	}

	return { customer_id: customerId, subscriptions };
};
