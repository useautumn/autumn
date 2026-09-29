import {
	AttachScenario,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { dispatchCustomerProductUpdatedWebhooks } from "@/internal/customers/cusProducts/actions/dispatchCustomerProductUpdatedWebhooks";

/**
 * Sends products_updated + billing.updated for a renewal of an already-active
 * customer product. `updates` describes changes the caller already persisted (e.g. the new store period).
 */
export const renewCustomerProduct = async ({
	ctx,
	customerProduct,
	fullCustomer,
	updates = {},
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	updates?: Partial<InsertCustomerProduct>;
}): Promise<void> => {
	const originalFullCustomer = structuredClone(fullCustomer);

	// Empty updates still surface an "updated" plan change so billing.updated mirrors the legacy webhook.
	await dispatchCustomerProductUpdatedWebhooks({
		ctx,
		customerProduct,
		fullCustomer,
		originalFullCustomer,
		scenario: AttachScenario.Renew,
		updates,
	});
};
