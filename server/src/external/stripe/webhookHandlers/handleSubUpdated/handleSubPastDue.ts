import {
	AttachScenario,
	type FullCusProduct,
	type Organization,
} from "@autumn/shared";
import type Stripe from "stripe";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { deleteCachedApiCustomer } from "../../../../internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";

export const isSubPastDue = ({
	previousAttributes,
	sub,
}: {
	previousAttributes: any;
	sub: Stripe.Subscription;
}) => {
	const wasPastDue = previousAttributes.status === "past_due";
	const isPastDue = sub.status === "past_due";

	return {
		pastDue: !wasPastDue && isPastDue,
	};
};

export const handleSubPastDue = async ({
	req,
	previousAttributes,
	org,
	sub,
	updatedCusProducts,
}: {
	req: ExtendedRequest;
	previousAttributes: any;
	sub: Stripe.Subscription;
	org: Organization;
	updatedCusProducts: FullCusProduct[];
}) => {
	const { pastDue } = isSubPastDue({
		previousAttributes,
		sub,
	});

	const { env, logger } = req;

	if (!pastDue || updatedCusProducts.length === 0) return;

	logger.info(
		`Subscription ${sub.id} is now past due, firing webhooks for ${updatedCusProducts.length} customer product(s)`,
	);

	if (!org.config.sync_status) return;

	for (const cusProd of updatedCusProducts) {
		try {
			await addProductsUpdatedWebhookTask({
				req,
				internalCustomerId: cusProd.internal_customer_id,
				org,
				env,
				customerId: null,
				logger,
				scenario: AttachScenario.PastDue,
				cusProduct: cusProd,
			});
		} catch (error) {
			logger.error("Failed to add products updated webhook task to queue", {
				error,
			});
		}
	}

	const customerId = updatedCusProducts[0].customer?.id;
	if (customerId) {
		await deleteCachedApiCustomer({
			customerId,
			orgId: org.id,
			env,
		});
	}
};
