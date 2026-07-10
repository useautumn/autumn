import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { planLicenseRepo } from "../../../repos/planLicenseRepo.js";
import { reconcileLicenseStateForCustomer } from "../../reconcile/reconcileLicenseState.js";
import {
	getApiCustomerLicense,
	licenseProductInternalIds,
} from "./getApiCustomerLicense.js";

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

	const internalProductIds = licenseProductInternalIds(state);
	if (internalProductIds.length === 0) return [];

	const licenseProducts = await planLicenseRepo.listProductsByInternalIds({
		db: ctx.db,
		internalProductIds,
	});

	return getApiCustomerLicense({ state, licenseProducts, entityId });
};
