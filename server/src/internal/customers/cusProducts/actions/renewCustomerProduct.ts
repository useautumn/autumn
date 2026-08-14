import {
	AttachScenario,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { emitCustomerProductBillingUpdated } from "@/internal/customers/cusProducts/actions/emitCustomerProductBillingUpdated";

/**
 * Sends products_updated + billing.updated for a renewal of an already-active
 * customer product. Pure side-effect: the cycle anchor is owned by the store.
 */
export const renewCustomerProduct = async ({
	ctx,
	customerProduct,
	fullCustomer,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Promise<void> => {
	const { org, env } = ctx;

	const originalFullCustomer = structuredClone(fullCustomer);

	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.Renew,
		cusProduct: customerProduct,
	});

	// No cusProduct mutation on renewal — empty updates still surface an
	// "updated" plan change so billing.updated mirrors the legacy webhook.
	emitCustomerProductBillingUpdated({
		ctx,
		originalFullCustomer,
		updateCustomerProducts: [{ customerProduct, updates: {} }],
	});
};
