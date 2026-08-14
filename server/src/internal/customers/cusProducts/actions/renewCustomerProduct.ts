import {
	AttachScenario,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { dispatchCustomerProductUpdatedWebhooks } from "@/internal/customers/cusProducts/actions/dispatchCustomerProductUpdatedWebhooks";

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
	const originalFullCustomer = structuredClone(fullCustomer);

	// No cusProduct mutation on renewal — empty updates still surface an
	// "updated" plan change so billing.updated mirrors the legacy webhook.
	await dispatchCustomerProductUpdatedWebhooks({
		ctx,
		customerProduct,
		fullCustomer,
		originalFullCustomer,
		scenario: AttachScenario.Renew,
		updates: {},
	});
};
