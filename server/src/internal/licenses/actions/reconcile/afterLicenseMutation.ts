import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runWithBillingLock } from "@/internal/billing/v2/utils/billingLock/runWithBillingLock.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { licenseGateRepo } from "../../repos/licenseGateRepo.js";
import { reconcileLicenseStateForCustomer } from "./reconcileLicenseState.js";

/**
 * Single exit ramp for every license mutation: converges assignment balances
 * and billing carriers under the customer billing lock, then drops the
 * customer cache. Catalog-wide events (link edits, version bumps) stay
 * lazy-converged — each customer converges on their next mutation.
 */
export const afterLicenseMutation = async ({
	ctx,
	customerId,
	internalCustomerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId?: string;
	internalCustomerId?: string;
	entityId?: string;
}) => {
	if (
		internalCustomerId &&
		!(await licenseGateRepo.touchesLicenses({ db: ctx.db, internalCustomerId }))
	) {
		return;
	}

	let externalCustomerId = customerId;
	if (!externalCustomerId && internalCustomerId) {
		const customer = await CusService.getByInternalId({
			db: ctx.db,
			internalId: internalCustomerId,
			errorIfNotFound: false,
		});
		externalCustomerId = customer?.id ?? undefined;
	}
	if (!externalCustomerId) return;

	await runWithBillingLock({
		ctx,
		customerId: externalCustomerId,
		errorMessage:
			"License update already in progress for this customer, try again in a few seconds",
		fn: () =>
			reconcileLicenseStateForCustomer({
				ctx,
				customerId: externalCustomerId,
				internalCustomerId,
			}),
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId: externalCustomerId,
		entityId,
		source: "license.mutation",
	});
};
