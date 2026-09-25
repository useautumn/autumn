import {
	cusEntsToUsage,
	type DeleteBalanceParamsV0,
	fullCustomerToCustomerEntitlements,
	isCusEntExpired,
	isPaidCustomerEntitlement,
	isPooledBalanceSourceCustomerEntitlement,
	isSyntheticPooledBalanceCustomerEntitlement,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { balanceRowsNotFoundError } from "../utils/balanceRowsNotFoundError.js";
import { buildCustomerEntitlementFilters } from "../utils/buildCustomerEntitlementFilters";
import { reapplyFeatureUsageDeduction } from "../utils/reapplyFeatureUsageDeduction";
import { validateInvoiceCreditBalanceMutation } from "../utils/validateInvoiceCreditBalanceMutation.js";
import { runBalanceWorkerDeleteBalance } from "./balanceWorker/runBalanceWorkerDeleteBalance.js";
import {
	paidBalanceNotDeletableError,
	pooledBalanceNotDeletableError,
} from "./deleteBalanceErrors.js";
import {
	findOverageCusEnt,
	markCusProductCustom,
	preserveBalanceAsOverage,
} from "./deleteBalanceUtils";

export const deleteBalance = async ({
	ctx,
	params,
	includeExpired = false,
}: {
	ctx: AutumnContext;
	params: DeleteBalanceParamsV0;
	includeExpired?: boolean;
}) => {
	const { customer_id, entity_id, feature_id, recalculate_balances } = params;

	if (recalculate_balances && !feature_id) {
		throw new RecaseError({
			message: "feature_id is required when recalculate_balances is true",
			statusCode: 400,
		});
	}

	// The worker holds no expired grant, and only the dashboard deletes one.
	if (isBalanceWorkerRolloutEnabled() && !includeExpired) {
		await runBalanceWorkerDeleteBalance({ ctx, params });
		return;
	}

	// 1. Get full customer
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customer_id,
		entityId: entity_id,
		withEntities: true,
		withSubs: true,
		includeExpiredLooseEntitlements: includeExpired,
	});

	const customerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId: feature_id,
		entity: fullCustomer.entity,
		customerEntitlementFilters: buildCustomerEntitlementFilters({ params }),
		includeExpired,
	});

	if (customerEntitlements.length === 0) {
		throw balanceRowsNotFoundError({
			customerId: params.customer_id,
			featureId: params.feature_id,
		});
	}

	for (const cusEnt of customerEntitlements) {
		validateInvoiceCreditBalanceMutation({ customerEntitlement: cusEnt });

		if (isPaidCustomerEntitlement(cusEnt)) {
			throw paidBalanceNotDeletableError({ params });
		}

		// Deleting either half orphans the other: the pool would keep granted for a
		// source that no longer exists, or contributions would point at nothing.
		if (
			isSyntheticPooledBalanceCustomerEntitlement({
				customerEntitlement: cusEnt,
			}) ||
			isPooledBalanceSourceCustomerEntitlement({ customerEntitlement: cusEnt })
		) {
			throw pooledBalanceNotDeletableError({ params });
		}
	}

	// Expired usage must never be redistributed onto live balances.
	const usageToRecalculate = recalculate_balances
		? cusEntsToUsage({
				cusEnts: customerEntitlements.filter(
					(cusEnt) => !isCusEntExpired({ cusEnt }),
				),
				entityId: fullCustomer.entity?.id ?? undefined,
			})
		: 0;
	const sameFeatureCusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId: feature_id,
		entity: fullCustomer.entity,
	});
	const overageCusEnt = findOverageCusEnt({
		recalculateBalances: recalculate_balances,
		usageToRecalculate,
		customerEntitlements,
		sameFeatureCusEnts,
	});

	for (const cusEnt of customerEntitlements) {
		if (cusEnt.id === overageCusEnt?.id) {
			await preserveBalanceAsOverage({
				ctx,
				cusEnt,
				customerEntitlements,
				fullCustomer,
				usageToRecalculate,
			});
			continue;
		}

		await CusEntService.delete({
			db: ctx.db,
			id: cusEnt.id,
		});

		await markCusProductCustom({ ctx, cusEnt });
	}

	await deleteCachedFullCustomer({
		ctx,
		customerId: fullCustomer.id ?? "",
	});

	if (!recalculate_balances || usageToRecalculate === 0) {
		return;
	}

	if (overageCusEnt) {
		return;
	}

	const targetFeatureId = feature_id ?? customerEntitlements[0]?.feature_id;
	if (!targetFeatureId) {
		return;
	}

	await reapplyFeatureUsageDeduction({
		ctx,
		customerId: customer_id,
		entityId: entity_id,
		featureId: targetFeatureId,
		usage: usageToRecalculate,
	});
};
