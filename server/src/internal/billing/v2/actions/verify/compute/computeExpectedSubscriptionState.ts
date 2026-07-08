import {
	type BillingContext,
	BillingVersion,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildStripePhasesUpdate } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate";
import {
	buildCusPriceCatalog,
	buildStoredPriceCatalog,
	type CusPriceCatalog,
	type StoredPriceCatalog,
} from "./buildStoredPriceCatalog";
import {
	classifyPhaseScenario,
	type PhaseScenario,
} from "./classifyPhaseScenario";

export type ExpectedSubscriptionState = {
	scenario: PhaseScenario;
	scheduledPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	cancelAtSeconds?: number;
	storedPriceCatalog: StoredPriceCatalog;
	cusPriceCatalog: CusPriceCatalog;
};

/**
 * Builds the expected Stripe subscription state from Autumn's customer_products alone —
 * mirrors what `evaluateStripeBillingPlan` does for a computed AutumnBillingPlan, except
 * here the "plan" is a read-only expected-state snapshot rather than a set of DB writes.
 */
export const computeExpectedSubscriptionState = ({
	ctx,
	fullCustomer,
	relatedCusProducts,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	relatedCusProducts: FullCusProduct[];
}): ExpectedSubscriptionState => {
	const billingContext: BillingContext = {
		fullCustomer,
		fullProducts: [],
		featureQuantities: [],
		currentEpochMs: Date.now(),
		billingCycleAnchorMs: "now",
		resetCycleAnchorMs: "now",
		billingVersion: relatedCusProducts[0]?.billing_version ?? BillingVersion.V2,
		actionSource: "verify",
	};

	const rawPhases = buildStripePhasesUpdate({
		ctx,
		billingContext,
		customerProducts: relatedCusProducts,
	});

	const { scenario, scheduledPhases, cancelAtSeconds } = classifyPhaseScenario({
		rawPhases,
	});

	const storedPriceCatalog = buildStoredPriceCatalog({
		cusProducts: relatedCusProducts,
	});
	const cusPriceCatalog = buildCusPriceCatalog({
		cusProducts: relatedCusProducts,
	});

	return {
		scenario,
		scheduledPhases,
		cancelAtSeconds,
		storedPriceCatalog,
		cusPriceCatalog,
	};
};
