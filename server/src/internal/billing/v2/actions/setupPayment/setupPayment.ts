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

export const setupPayment = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SetupPaymentParamsV1;
}): Promise<SetupPaymentResult> => {
	const { logger } = ctx;

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
