import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { licenseGateRepo } from "../../repos/licenseGateRepo.js";
import { reconcileLicenseStateForCustomer } from "./reconcileLicenseState.js";

/**
 * Single exit ramp for every license mutation: converges assignment balances,
 * then drops the customer cache. Never acquires a lock itself — route endpoints
 * hold the customer billing lock; other callers rely on atomic seat takes/releases
 * plus this self-healing recompute, which corrects any transient over-count.
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

	try {
		await reconcileLicenseStateForCustomer({
			ctx,
			customerId: externalCustomerId,
			internalCustomerId,
		});
	} finally {
		// The mutation is already committed; the cache must drop even when
		// convergence fails so reads never serve pre-mutation state.
		await deleteCachedFullCustomer({
			ctx,
			customerId: externalCustomerId,
			entityId,
			source: "license.mutation",
		});
	}
};
