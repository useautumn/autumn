import {
	type AttachBillingContext,
	type AttachParamsV1,
	type BillingPlan,
	type Checkout,
	CheckoutAction,
	CheckoutStatus,
	checkoutToUrl,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setCheckoutCache } from "@/internal/checkouts/actions/cache";
import { checkoutRepo } from "@/internal/checkouts/repos/checkoutRepo";
import { generateId } from "@/utils/genUtils";

// 24 hours in milliseconds
const CHECKOUT_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Current params version for attach
const ATTACH_PARAMS_VERSION = 1;

/**
 * Creates an Autumn checkout from billing plan.
 * Stores in cache (primary) and DB (audit).
 * Returns the checkout object and URL.
 */
export async function billingPlanToAutumnCheckout({
	ctx,
	params,
	billingContext,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
	billingContext: AttachBillingContext;
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
		action: CheckoutAction.Attach,
		params,
		params_version: ATTACH_PARAMS_VERSION,
		status: CheckoutStatus.Pending,
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

	const checkoutUrl = checkoutToUrl({ checkoutId });

	return { checkout, checkoutUrl };
}
