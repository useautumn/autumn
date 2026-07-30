import type {
	ExistingRollover,
	ExistingRolloversConfig,
	ExistingUsages,
	ExistingUsagesConfig,
	FullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import {
	cusProductsToCusEnts,
	filterCustomerProductsByActiveStatuses,
	isCustomerProductAddOn,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/applyExistingRollovers";
import { cusProductToExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/cusProductToExistingRollovers";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";

const getEntitiesForExistingUsage = ({
	fullCustomer,
	customerProduct,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}) => {
	if (!isCustomerProductAddOn(customerProduct)) return fullCustomer.entities;

	const activeCustomerProducts = filterCustomerProductsByActiveStatuses({
		customerProducts: fullCustomer.customer_products,
	});
	const coveredInternalFeatureIds = new Set(
		cusProductsToCusEnts({ cusProducts: activeCustomerProducts }).map(
			(customerEntitlement) => customerEntitlement.internal_feature_id,
		),
	);
	return fullCustomer.entities.filter(
		(entity) => !coveredInternalFeatureIds.has(entity.internal_feature_id),
	);
};

export const applyExistingStatesToCustomerProduct = ({
	ctx,
	fullCustomer,
	customerProduct,
	existingUsagesConfig,
	existingRolloversConfig,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	existingUsagesConfig?: ExistingUsagesConfig;
	existingRolloversConfig?: ExistingRolloversConfig;
}) => {
	let existingUsages: ExistingUsages = {};

	if (existingUsagesConfig) {
		const { fromCustomerProduct } = existingUsagesConfig;

		existingUsages = cusProductToExistingUsages({
			cusProduct: fromCustomerProduct,
			entityId: fullCustomer.entity?.id ?? undefined,
			...existingUsagesConfig,
		});
	}

	applyExistingUsages({
		ctx,
		customerProduct,
		existingUsages,
		entities: getEntitiesForExistingUsage({
			fullCustomer,
			customerProduct,
		}),
	});

	let existingRollovers: ExistingRollover[] = [];

	if (existingRolloversConfig) {
		const { fromCustomerProduct } = existingRolloversConfig;

		existingRollovers = cusProductToExistingRollovers({
			cusProduct: fromCustomerProduct,
		});
	}

	applyExistingRollovers({
		customerProduct,
		existingRollovers,
	});
};
