import type { SetupPaymentParamsV1 } from "@autumn/shared";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers/operations/getOrCreateStripeCustomer";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer";
import { createSetupCheckoutSession } from "./createSetupCheckoutSession";
import { setupPaymentToAttachParams } from "./setupPaymentUtils";

export interface SetupPaymentResult {
	customer_id: string;
	entity_id?: string;
	url: string;
}

/**
 * Creates a Stripe checkout session in setup mode.
 * If plan_id is specified, validates the plan via preview and attaches it after setup completes.
 */
export const setupPayment = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SetupPaymentParamsV1;
}): Promise<SetupPaymentResult> => {
	const { logger } = ctx;

	// 1. Get or create customer (+ Stripe customer)
	const fullCustomer = await getOrCreateCustomer({
		ctx,
		customerId: params.customer_id,
		customerData: params.customer_data,
		entityId: params.entity_id,
		entityData: params.entity_data,
	});

	await getOrCreateStripeCustomer({
		ctx,
		customer: fullCustomer,
	});

	// 2. If plan_id specified, run attach in preview mode to validate
	if (params.plan_id) {
		logger.info(`Setup payment: validating plan ${params.plan_id} via preview`);

		const attachParams = setupPaymentToAttachParams({ params });

		await billingActions.attach({
			ctx,
			params: attachParams,
			preview: true,
		});

		logger.info(`Setup payment: plan ${params.plan_id} validated successfully`);
	}

	// 3. Create Stripe setup checkout session
	const { url } = await createSetupCheckoutSession({
		ctx,
		customer: fullCustomer,
		params,
	});

	return {
		customer_id: fullCustomer.id ?? fullCustomer.internal_id,
		entity_id: params.entity_id,
		url: url ?? "",
	};
};
