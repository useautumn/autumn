import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { reconcileLicenseStateForCustomer } from "../../reconcile/reconcileLicenseState.js";
import { buildLicenseBalances } from "./buildLicenseBalances.js";

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
		customerId,
		fullCustomer,
	});
	if (!state) return [];

	return await buildLicenseBalances({ ctx, state, entityId });
};
