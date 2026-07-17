import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executePooledBalanceOps } from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { customerTouchesLicenses } from "../../repos/customerLicenseRepo/customerTouchesLicenses.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import { logLicenseAction } from "../logs/logLicenseAction.js";
import { expireUnusedAssignments } from "./expireUnusedAssignments.js";
import { reconcileCustomerLicenseBalances } from "./reconcileCustomerLicenseBalances/reconcileCustomerLicenseBalances.js";
import { setupReconcileContext } from "./setupReconcileContext.js";
import type { CustomerLicenseState, ReconcileContext } from "./types.js";

const expireOrphanAssignments = async ({
	ctx,
	context,
	customerId,
	onPooledBalanceTransition,
}: {
	ctx: AutumnContext;
	context: ReconcileContext;
	customerId: string;
	onPooledBalanceTransition?: () => void;
}) => {
	const validCustomerLicenseLinkIds = context.customerLicenses.map(
		(customerLicense) => customerLicense.link_id,
	);
	const orphanAssignments =
		await licenseAssignmentRepo.listActiveOrphanAssignments({
			db: ctx.db,
			internalCustomerId: context.fullCustomer.internal_id,
			validCustomerLicenseLinkIds,
		});
	if (orphanAssignments.length === 0) return;

	onPooledBalanceTransition?.();
	await executePooledBalanceOps({
		ctx,
		customerId,
		pooledBalanceOps: orphanAssignments.map((assignment) => ({
			op: "remove_source",
			internalCustomerId: assignment.internal_customer_id,
			sourceCustomerProductId: assignment.id,
			effectiveAt: null,
		})),
		beforeRebalance: ({ db }) =>
			licenseAssignmentRepo.expireOrphanAssignments({
				db,
				internalCustomerId: context.fullCustomer.internal_id,
				validCustomerLicenseLinkIds,
				endedAt: Date.now(),
			}),
	});
};

/**
 * Whole-customer license convergence: setup gathers bounded reads, balances
 * converge the numbers. Idempotent; null when the customer touches no licenses.
 */
export const reconcileLicenseStateForCustomer = async ({
	ctx,
	idOrInternalId,
	fullCustomer,
	deleteCache = false,
	flushBalances = false,
	onPooledBalanceTransition,
}: {
	ctx: AutumnContext;
	idOrInternalId?: string;
	fullCustomer?: FullCustomer;
	deleteCache?: boolean;
	flushBalances?: boolean;
	onPooledBalanceTransition?: () => void;
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
	let shouldFlushBalances = flushBalances;

	try {
		const context = await setupReconcileContext({
			ctx,
			fullCustomer: customer,
		});
		await reconcileCustomerLicenseBalances({ ctx, context });
		await expireOrphanAssignments({
			ctx,
			context,
			customerId: customer.id ?? customer.internal_id,
			onPooledBalanceTransition: () => {
				shouldFlushBalances = true;
				onPooledBalanceTransition?.();
			},
		});
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
		if (deleteCache || shouldFlushBalances) {
			await deleteCachedFullCustomer({
				ctx,
				customerId: customer.id ?? customer.internal_id,
				source: "license.reconcile",
				flushBalances: shouldFlushBalances,
			});
		}
	}
};
