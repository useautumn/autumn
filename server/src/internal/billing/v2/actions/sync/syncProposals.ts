import type { SyncProposalsParamsV0 } from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { matchStripeSubscriptionsToProducts } from "./utils/matchStripeSubscriptionsToProducts";
import type { SyncMatchMethod } from "./utils/matchSubscriptionItemToAutumn";

export type SyncProposalStripeTier = {
	up_to: number | null;
	unit_amount: number | null;
	flat_amount: number | null;
};

export type SyncProposalItem = {
	stripe_price_id: string;
	stripe_product_id: string | null;
	stripe_product_name: string | null;
	quantity: number | null;

	unit_amount: number | null;
	currency: string | null;
	billing_scheme: "per_unit" | "tiered" | null;
	tiers_mode: "graduated" | "volume" | null;
	recurring_usage_type: "licensed" | "metered" | null;
	tiers: SyncProposalStripeTier[] | null;

	matched_plan_id: string | null;
	matched_plan_name: string | null;
	matched_price_id: string | null;
	match_method: SyncMatchMethod | null;
};

export type SyncProposal = {
	stripe_subscription_id: string;
	stripe_subscription_status: string;
	current_period_end: number;
	trial_end: number | null;
	cancel_at: number | null;
	canceled_at: number | null;
	already_linked_product_id: string | null;
	items: SyncProposalItem[];
};

export type SyncProposalsResponse = {
	proposals: SyncProposal[];
};

export const syncProposals = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SyncProposalsParamsV0;
}): Promise<SyncProposalsResponse> => {
	const { db, org, env } = ctx;

	// 1. Get full customer to find Stripe customer ID
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: params.customer_id,
		withSubs: true,
	});

	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new RecaseError({
			message: "Customer has no linked Stripe customer",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// 2. Create Stripe client and list subscriptions
	const stripeCli = createStripeCli({ org, env });
	const stripeSubscriptions = await stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		limit: 100,
		expand: ["data.items.data"],
	});

	if (stripeSubscriptions.data.length === 0) {
		return { proposals: [] };
	}

	// 3. Match Stripe subscription items to Autumn products
	const proposals = await matchStripeSubscriptionsToProducts({
		db,
		orgId: org.id,
		env,
		stripeCli,
		stripeSubscriptions: stripeSubscriptions.data,
		customerProducts: fullCustomer.customer_products,
	});

	return { proposals };
};
