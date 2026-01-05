import type { Customer } from "@autumn/shared";
import {
	clearCusEntsFromCache,
	resetCustomerEntitlement,
} from "@/cron/cronUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { cusProductToCusEnt } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getMainCusProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";

export const resetAndGetCusEnt = async ({
	db,
	customer,
	productGroup,
	featureId,
	skipCacheDeletion = false,
}: {
	db: DrizzleCli;
	customer: Customer;
	productGroup: string;
	featureId: string;
	skipCacheDeletion?: boolean;
}) => {
	// Run reset cusEnt on ...
	let mainCusProduct = await getMainCusProduct({
		db,
		internalCustomerId: customer.internal_id,
		productGroup,
	});

	let cusEnt = cusProductToCusEnt({
		cusProduct: mainCusProduct!,
		featureId,
	});

	const resetCusEnt = {
		...cusEnt!,
		customer,
	};

	const updatedCusEnt = await resetCustomerEntitlement({
		db,
		cusEnt: resetCusEnt,
		updatedCusEnts: [],
	});

	if (!skipCacheDeletion) {
		await clearCusEntsFromCache({ cusEnts: [resetCusEnt] });
	}

	if (updatedCusEnt) {
		await CusEntService.upsert({
			db,
			data: [updatedCusEnt],
		});
	}

	mainCusProduct = await getMainCusProduct({
		db,
		internalCustomerId: customer.internal_id,
		productGroup,
	});

	cusEnt = cusProductToCusEnt({
		cusProduct: mainCusProduct!,
		featureId,
	});

	return cusEnt;
};
