import { expect } from "bun:test";
import { cp, type FullCusProduct } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { buildStripePhasesUpdate } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate";
import { formatUnixToDateTime } from "@/utils/genUtils";
import { classifyPhaseScenario } from "./classifyPhaseScenario";
import {
	compareItems,
	normalizeActualSubItem,
	normalizeExpectedPhaseItem,
} from "./helpers/compareItems";
import { validateRewards } from "./helpers/validateRewards";
import { validateSchedulePhases } from "./helpers/validateSchedulePhases";
import { validateSubState } from "./helpers/validateSubState";
import type { ExpectStripeSubOptions } from "./types";

/** Verifies a single Stripe subscription against expected state derived from customer products. */
export const verifySubscription = async ({
	ctx,
	subId,
	cusProducts,
	options,
}: {
	ctx: TestContext;
	subId: string;
	cusProducts: FullCusProduct[];
	options?: ExpectStripeSubOptions;
}) => {
	const debug = options?.debug ?? false;

	// Filter to cusProducts belonging to this subscription that are paid + recurring + relevant status
	const relatedCusProducts = cusProducts.filter(
		(cusProduct) =>
			cusProduct.subscription_ids?.includes(subId) &&
			cp(cusProduct).paid().recurring().hasRelevantStatus().valid,
	);

	if (debug) {
		console.log(`\n--- Verifying subscription: ${subId} ---`);
		console.log(
			`Related cusProducts (${relatedCusProducts.length}):`,
			relatedCusProducts.map((cp) => ({
				product: cp.product.name,
				status: cp.status,
				canceled: cp.canceled,
				entity: cp.internal_entity_id,
			})),
		);
	}

	// 1. Build expected phases using production code
	const billingContext = contexts.createBilling({
		customerProducts: relatedCusProducts,
	});

	const rawPhases = buildStripePhasesUpdate({
		ctx,
		billingContext,
		customerProducts: relatedCusProducts,
	});

	// 2. Classify into scenario
	const { scenario, scheduledPhases, cancelAtSeconds } = classifyPhaseScenario({
		rawPhases,
	});

	if (debug) {
		console.log(`Scenario: ${scenario}`);
		console.log(`Scheduled phases: ${scheduledPhases.length}`);
		console.log(
			`Cancel at: ${cancelAtSeconds ? formatUnixToDateTime(cancelAtSeconds * 1000) : "none"}`,
		);
	}

	// 3. Fetch the actual Stripe subscription
	const sub = await ctx.stripeCli.subscriptions.retrieve(subId, {
		expand: ["discounts.coupon"],
	});

	// 4. Compare current subscription items against first phase items
	const firstPhase = scheduledPhases[0];
	if (firstPhase) {
		const expectedItems = (firstPhase.items ?? []).map((item) =>
			normalizeExpectedPhaseItem({ item }),
		);
		const actualItems = sub.items.data.map((item) =>
			normalizeActualSubItem({ item }),
		);

		compareItems({
			expectedItems,
			actualItems,
			label: `sub:${subId}`,
			debug,
		});
	}

	// 5. Validate cancel / schedule state based on scenario
	await validateSubState({
		ctx,
		sub,
		scenario,
		cancelAtSeconds,
		shouldBeCanceled: options?.shouldBeCanceled,
		debug,
	});

	// 6. Validate schedule phases if multi_phase
	if (scenario === "multi_phase") {
		await validateSchedulePhases({
			ctx,
			sub,
			scheduledPhases,
			debug,
		});
	}

	// 7. Validate status override
	if (options?.status) {
		expect(sub.status).toBe(options.status);
	}

	// 8. Validate rewards/discounts
	if (options?.rewards) {
		validateRewards({ sub, rewards: options.rewards });
	}
};
