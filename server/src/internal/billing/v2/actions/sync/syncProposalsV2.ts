import {
	ErrCode,
	type FullCusProduct,
	RecaseError,
	type SyncProposalsV2Params,
	type SyncProposalsV2Response,
	type SyncProposalV2,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { subscriptionToSyncParams } from "./subscriptionToSyncParams";

const findAlreadyLinkedProductId = ({
	stripeSubscriptionId,
	customerProducts,
}: {
	stripeSubscriptionId: string;
	customerProducts: FullCusProduct[];
}): string | null => {
	const linked = customerProducts.find((cp) =>
		cp.subscription_ids?.includes(stripeSubscriptionId),
	);
	return linked?.product?.id ?? null;
};

const buildProposal = async ({
	ctx,
	customerId,
	subscription,
	customerProducts,
}: {
	ctx: AutumnContext;
	customerId: string;
	subscription: Stripe.Subscription;
	customerProducts: FullCusProduct[];
}): Promise<SyncProposalV2> => {
	const { params, schedule } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
	});

	return {
		stripe_subscription_id: params.stripe_subscription_id,
		stripe_schedule_id: params.stripe_schedule_id,
		phases: params.phases ?? [],
		stripe_subscription: subscription,
		stripe_schedule: schedule,
		already_linked_product_id: findAlreadyLinkedProductId({
			stripeSubscriptionId: subscription.id,
			customerProducts,
		}),
	};
};

/**
 * V2 sync proposals — for each Stripe subscription, runs detection +
 * `subscriptionToSyncParams` to produce a draft `SyncParamsV1` and packages
 * it with display extras. Frontend can mutate `phases` and pass straight to
 * `/billing.sync`.
 */
export const syncProposalsV2 = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SyncProposalsV2Params;
}): Promise<SyncProposalsV2Response> => {
	const { org, env } = ctx;

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

	const stripeCli = createStripeCli({ org, env });
	const subscriptionList = await stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		limit: 100,
	});

	if (subscriptionList.data.length === 0) {
		return { customer_id: params.customer_id, proposals: [] };
	}

	// Stripe caps `expand` at 4 levels, so retrieve each subscription with
	// `items.data.price.product` (4 levels) for the UI.
	const proposals = await Promise.all(
		subscriptionList.data.map(async ({ id }) => {
			const subscription = await stripeCli.subscriptions.retrieve(id, {
				expand: ["items.data.price.product"],
			});
			return buildProposal({
				ctx,
				customerId: params.customer_id,
				subscription,
				customerProducts: fullCustomer.customer_products,
			});
		}),
	);

	return { customer_id: params.customer_id, proposals };
};
