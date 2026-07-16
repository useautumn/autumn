import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { customerTouchesLicenses } from "../../repos/customerLicenseRepo/customerTouchesLicenses.js";
import { logLicenseAction } from "../logs/logLicenseAction.js";
import { expireUnusedAssignments } from "./expireUnusedAssignments.js";
import { reconcileCustomerLicenseBalances } from "./reconcileCustomerLicenseBalances/reconcileCustomerLicenseBalances.js";
// import { reparentCustomerLicenses } from "./reparentCustomerLicenses/reparentCustomerLicenses.js";
import { setupReconcileContext } from "./setupReconcileContext.js";
import type { CustomerLicenseState } from "./types.js";

/**
 * Whole-customer license convergence: setup gathers bounded reads, reparent
 * transitions stranded customer licenses, balances converge the numbers.
 * Idempotent; the returned state mirrors the database after the writes, or
 * null when the customer touches no licenses (gated before any full-customer
 * read). Pass fullCustomer only when it reflects post-mutation state.
 * deleteCache is for callers with no other cache invalidation (e.g. webhook
 * flows); the drop runs even when convergence fails, so reads never serve
 * pre-mutation state.
 */
export const reconcileLicenseStateForCustomer = async ({
	ctx,
	idOrInternalId,
	fullCustomer,
	deleteCache = false,
}: {
	ctx: AutumnContext;
	idOrInternalId?: string;
	fullCustomer?: FullCustomer;
	deleteCache?: boolean;
}): Promise<CustomerLicenseState | null> => {
	if (!fullCustomer && !idOrInternalId) return null;

	const touchesLicenses = await customerTouchesLicenses({
		ctx,
		idOrInternalId,
		fullCustomer,
	});
	if (!touchesLicenses) return null;

	const customer =
		fullCustomer ??
		(await CusService.getFull({
			ctx,
			idOrInternalId: idOrInternalId as string,
		}));

	try {
		const context = await setupReconcileContext({
			ctx,
			fullCustomer: customer,
		});
		// Reparent is paused while sync-driven transitions settle.
		// await reparentCustomerLicenses({ ctx, context });
		await reconcileCustomerLicenseBalances({ ctx, context });
		await expireUnusedAssignments({ ctx, context });

		logLicenseAction({
			ctx,
			action: "reconcile",
			details: {
				customer: customer.id ?? customer.internal_id,
				parents: context.parentCustomerProducts.length,
				customerLicenses: context.customerLicenses.length,
			},
		});
		return {
			parentCustomerProducts: context.parentCustomerProducts,
			customerLicenses: context.customerLicenses,
		};
	} finally {
		if (deleteCache && customer.id) {
			await deleteCachedFullCustomer({
				ctx,
				customerId: customer.id,
				source: "license.reconcile",
			});
		}
	}
};
