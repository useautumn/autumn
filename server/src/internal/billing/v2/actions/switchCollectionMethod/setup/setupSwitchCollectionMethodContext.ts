import {
	CollectionMethod,
	type FullCusProduct,
	type FullCustomer,
	type InvoiceMode,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findTargetCustomerProduct } from "@/internal/billing/v2/actions/updateSubscription/setup/findTargetCustomerProduct";
import { fetchStripeCustomerForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeCustomerForBilling";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";

export type SwitchCollectionMethodContext = {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	targetCollectionMethod: CollectionMethod;
	invoiceMode?: InvoiceMode;
	applyToAutoTopups: boolean;
	stripeCustomer?: Stripe.Customer;
	paymentMethod?: Stripe.PaymentMethod;
	stripeSubscription?: Stripe.Subscription;
};

export const setupSwitchCollectionMethodContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
}): Promise<SwitchCollectionMethodContext> => {
	const fullCustomer = await setupFullCustomerContext({ ctx, params });
	const customerProduct = await findTargetCustomerProduct({
		ctx,
		params,
		fullCustomer,
	});

	const { stripeCus: stripeCustomer, paymentMethod } =
		await fetchStripeCustomerForBilling({
			ctx,
			fullCus: fullCustomer,
			createIfMissing: false,
		});

	const stripeSubscriptionId = customerProduct.subscription_ids?.[0];
	const stripeSubscription = stripeSubscriptionId
		? await createStripeCli({
				org: ctx.org,
				env: ctx.env,
			}).subscriptions.retrieve(stripeSubscriptionId, { expand: ["schedule"] })
		: undefined;

	const enabled = params.invoice_mode?.enabled === true;

	return {
		fullCustomer,
		customerProduct,
		targetCollectionMethod: enabled
			? CollectionMethod.SendInvoice
			: CollectionMethod.ChargeAutomatically,
		invoiceMode: await setupInvoiceModeContext({
			ctx,
			fullCustomer,
			params,
			stripeCustomer,
			allowApplyToAutoTopups: true,
		}),
		applyToAutoTopups: params.invoice_mode?.apply_to_auto_topups === true,
		stripeCustomer,
		paymentMethod,
		stripeSubscription,
	};
};
