import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { licenseGateRepo } from "../../repos/licenseGateRepo.js";
import { reconcileLicenseStateForCustomer } from "./reconcileLicenseState.js";

/**
 * Single exit ramp for every license mutation. CONTRACT: the caller holds
 * the customer billing lock (route lock config or runWithBillingLock at the
 * entry point) — this function never acquires. It converges assignment
 * balances and billing carriers, then drops the
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

	await reconcileLicenseStateForCustomer({
		ctx,
		customerId: externalCustomerId,
		internalCustomerId,
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId: externalCustomerId,
		entityId,
		source: "license.mutation",
	});
};
