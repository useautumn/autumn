import {
	cusEntsToUsage,
	type DeleteBalanceParamsV0,
	findFeatureById,
	fullCustomerToCustomerEntitlements,
	isPaidCustomerEntitlement,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executePostgresDeduction } from "@/internal/balances/utils/deduction/executePostgresDeduction";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { buildCustomerEntitlementFilters } from "../utils/buildCustomerEntitlementFilters";

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
		});
	}

	for (const cusEnt of customerEntitlements) {
		if (isPaidCustomerEntitlement(cusEnt)) {
			throw new RecaseError({
				message: `Cannot delete paid balance for feature ${feature_id} and customer ${customer_id}`,
			});
		}
	}

	const usageToRecalculate = recalculate_balances
		? cusEntsToUsage({
				cusEnts: customerEntitlements,
				entityId: fullCustomer.entity?.id ?? undefined,
			})
		: 0;

	for (const cusEnt of customerEntitlements) {
		await CusEntService.delete({
			db: ctx.db,
			id: cusEnt.id,
		});

		if (cusEnt.customer_product_id) {
			await CusProductService.update({
				ctx,
				cusProductId: cusEnt.customer_product_id,
				updates: {
					is_custom: true,
				},
			});
		}
	}

	await deleteCachedFullCustomer({
		ctx,
		customerId: fullCustomer.id ?? "",
	});

	if (!recalculate_balances || usageToRecalculate === 0) {
		return;
	}

	const survivingFullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customer_id,
		entityId: entity_id,
		withEntities: true,
		withSubs: true,
	});

	const targetFeatureId = feature_id ?? customerEntitlements[0]?.feature_id;
	if (!targetFeatureId) {
		return;
	}

	const feature = findFeatureById({
		features: ctx.features,
		featureId: targetFeatureId,
		errorOnNotFound: true,
	});

	await executePostgresDeduction({
		ctx,
		fullCustomer: survivingFullCustomer,
		customerId: survivingFullCustomer.id ?? customer_id,
		entityId: entity_id,
		deductions: [
			{
				feature,
				deduction: usageToRecalculate,
			},
		],
		options: {
			alterGrantedBalance: false,
			overageBehaviour: "allow",
		},
	});
};
