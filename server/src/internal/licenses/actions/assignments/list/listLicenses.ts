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
	// 1. Setup
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId, entity_id: entityId },
	});

	// 2. Converge to current state
	const state = await reconcileLicenseStateForCustomer({
		ctx,
		customerId,
		fullCustomer,
	});
	if (!state) return [];

	// 3. Serialize balances per pool
	return await buildLicenseBalances({ ctx, state, entityId });
};
