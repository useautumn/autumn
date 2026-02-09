import type {
	ExistingRollover,
	ExistingRolloversConfig,
	ExistingUsages,
	ExistingUsagesConfig,
	FullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/applyExistingRollovers";
import { cusProductToExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/cusProductToExistingRollovers";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";

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
			entityId: fullCustomer.entity?.id,
			...existingUsagesConfig,
		});
	}

	applyExistingUsages({
		ctx,
		customerProduct,
		existingUsages,
		entities: fullCustomer.entities,
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
