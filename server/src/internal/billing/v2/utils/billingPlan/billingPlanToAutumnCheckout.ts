import {
	type AttachBillingContext,
	type AttachParamsV1,
	type BillingPlan,
	type Checkout,
	type CheckoutAction,
	CheckoutStatus,
	checkoutToUrl,
	type CreateScheduleBillingContext,
	type CreateScheduleParamsV0,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setCheckoutCache } from "@/internal/checkouts/actions/cache";
import { checkoutRepo } from "@/internal/checkouts/repos/checkoutRepo";
import { generateId } from "@/utils/genUtils";

// 24 hours in milliseconds
const CHECKOUT_EXPIRY_MS = 24 * 60 * 60 * 1000;

const CHECKOUT_PARAMS_VERSION = 1;

/**
 * Creates an Autumn checkout from billing plan.
 * Stores in cache (primary) and DB (audit).
 * Returns the checkout object and URL.
 */
export async function billingPlanToAutumnCheckout({
	ctx,
	action,
	params,
	billingContext,
}: {
	ctx: AutumnContext;
	action: CheckoutAction;
	params: AttachParamsV1 | CreateScheduleParamsV0 | UpdateSubscriptionV1Params;
	billingContext:
		| AttachBillingContext
		| CreateScheduleBillingContext
		| UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
}): Promise<{ checkout: Checkout; checkoutUrl: string }> {
	const checkoutId = generateId("co");
	const now = Date.now();
	const expiresAt = now + CHECKOUT_EXPIRY_MS;

	const { fullCustomer } = billingContext;

	const checkout: Checkout = {
		id: checkoutId,
		org_id: ctx.org.id,
		env: ctx.env,
		internal_customer_id: fullCustomer.internal_id,
		customer_id: fullCustomer.id ?? fullCustomer.internal_id,
		action,
		params,
		params_version: CHECKOUT_PARAMS_VERSION,
		status: CheckoutStatus.Pending,
		response: null,
		stripe_invoice_id: null,
		created_at: now,
		expires_at: expiresAt,
		completed_at: null,
	};

	// 1. Store in cache (primary storage)
	await setCheckoutCache({
		checkoutId,
		data: checkout,
	});

	// 2. Store in DB (audit/backup)
	await checkoutRepo.insert({
		db: ctx.db,
		data: checkout,
	});

	const checkoutUrl = checkoutToUrl({
		action,
		checkoutId,
	});

	return { checkout, checkoutUrl };
}
