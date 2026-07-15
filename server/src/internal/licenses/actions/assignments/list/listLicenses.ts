import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { reconcileLicenseStateForCustomer } from "../../reconcile/reconcileLicenseState.js";
import { getApiCustomerLicense } from "./getApiCustomerLicense.js";

export const listLicenses = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
}) => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId, entity_id: entityId },
	});

	const state = await reconcileLicenseStateForCustomer({
		ctx,
		fullCustomer,
	});
	if (!state || state.customerLicenses.length === 0) return [];

	return getApiCustomerLicense({ state });
};
