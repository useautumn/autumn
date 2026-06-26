import {
	cusEntsToUsage,
	type DeleteBalanceParamsV0,
	fullCustomerToCustomerEntitlements,
	isPaidCustomerEntitlement,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { buildCustomerEntitlementFilters } from "../utils/buildCustomerEntitlementFilters";
import { reapplyFeatureUsageDeduction } from "../utils/reapplyFeatureUsageDeduction";
import {
	findOverageCusEnt,
	markCusProductCustom,
	preserveBalanceAsOverage,
} from "./deleteBalanceUtils";

export const deleteBalance = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: DeleteBalanceParamsV0;
}) => {
	const { customer_id, entity_id, feature_id, recalculate_balances } = params;

	if (recalculate_balances && !feature_id) {
		throw new RecaseError({
			message: "feature_id is required when recalculate_balances is true",
			statusCode: 400,
		});
	}

	// 1. Get full customer
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customer_id,
		entityId: entity_id,
		withEntities: true,
		withSubs: true,
	});

	// 2. Get balance
	const customerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId: feature_id,
		entity: fullCustomer.entity,
		customerEntitlementFilters: buildCustomerEntitlementFilters({ params }),
	});

	if (customerEntitlements.length === 0) {
		throw new RecaseError({
			message: `Balance not found for feature ${feature_id} and customer ${customer_id}`,
			statusCode: 404,
		});
	}

	for (const cusEnt of customerEntitlements) {
		if (isPaidCustomerEntitlement(cusEnt)) {
			throw new RecaseError({
				message: `Cannot delete paid balance for feature ${feature_id} and customer ${customer_id}`,
				statusCode: 409,
			});
		}
	}

	const usageToRecalculate = recalculate_balances
		? cusEntsToUsage({
				cusEnts: customerEntitlements,
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
