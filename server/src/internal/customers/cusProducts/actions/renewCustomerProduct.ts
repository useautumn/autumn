import {
	AttachScenario,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { dispatchCustomerProductUpdatedWebhooks } from "@/internal/customers/cusProducts/actions/dispatchCustomerProductUpdatedWebhooks";
import { updateCustomerProductDbAndCache } from "@/internal/customers/cusProducts/actions/updateDbAndCache";

/**
 * Sends products_updated + billing.updated for a renewal of an already-active
 * customer product, persisting any store-owned `updates` (e.g. the new period).
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

	if (Object.keys(updates).length > 0) {
		await updateCustomerProductDbAndCache({
			ctx,
			customerId: fullCustomer.id ?? "",
			cusProductId: customerProduct.id,
			updates,
		});
	}

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
