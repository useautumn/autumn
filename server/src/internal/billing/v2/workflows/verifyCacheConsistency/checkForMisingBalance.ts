import {
	CusProductStatus,
	cusProductsToCusEnts,
	type FullCustomer,
	isBooleanCusEnt,
	isContUseFeature,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import { Decimal } from "decimal.js";
import { getSentryTags } from "@/external/sentry/sentryUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import type { VerifyCacheInput } from "./verifyCacheConsistency.js";

export const checkForMisingBalance = async ({
	ctx,
	payload,
	fullCustomer,
}: {
	ctx: AutumnContext;
	payload: VerifyCacheInput;
	fullCustomer: FullCustomer;
}) => {
	const {
		newCustomerProductId,
		previousFullCustomer: previousFullCustomerString,
	} = payload;
	const previousFullCustomer = JSON.parse(
		previousFullCustomerString,
	) as FullCustomer;

	const cusProduct = fullCustomer.customer_products.find(
		(cp) => cp.id === newCustomerProductId,
	);

	if (!cusProduct || cusProduct.status === CusProductStatus.Scheduled) return;

	const cusEnts = cusProductsToCusEnts({
		cusProducts: [cusProduct],
	});

	// get previous api customer
	const { apiCustomer: previousApiCustomer } = await getApiCustomerBase({
		ctx,
		fullCus: previousFullCustomer,
		withAutumnId: true,
	});

	const { apiCustomer: newApiCustomer } = await getApiCustomerBase({
		ctx,
		fullCus: fullCustomer,
		withAutumnId: true,
	});

	for (const cusEnt of cusEnts) {
		const feature = cusEnt.entitlement.feature;

		// 1. If unlimited or boolean feature, skip
		if (isUnlimitedCusEnt(cusEnt) || isBooleanCusEnt({ cusEnt })) continue;

		if (isContUseFeature({ feature })) continue;

		const previousBalance = previousApiCustomer.balances?.[feature.id];
		const newBalance = newApiCustomer.balances?.[feature.id];

		// In V1, 'granted' = included_grant + prepaid_grant (combined)
		const previousTotalBalance = new Decimal(previousBalance?.granted ?? 0);
		const newTotalBalance = new Decimal(newBalance?.granted ?? 0);

		const previousUsage = new Decimal(previousBalance?.usage ?? 0);
		const newUsage = new Decimal(newBalance?.usage ?? 0);

		// If usage has increased by difference in granted balance, there's a problem...
		const usageIncrease = newUsage.sub(previousUsage);
		const grantedBalanceIncrease = newTotalBalance.sub(previousTotalBalance);

		// Check if usage increase is within 99.5% of granted balance increase (suspicious race condition)
		const threshold = grantedBalanceIncrease.mul(0.995);

		if (grantedBalanceIncrease.gt(0) && usageIncrease.gte(threshold)) {
			const errMessage = `[RACE CONDITION] Usage increase (${usageIncrease}), granted balance increase (${grantedBalanceIncrease.toNumber()}), feature (${feature.name}), customer (${fullCustomer.id}), product: ${cusProduct.product?.name}`;

			Sentry.captureException(errMessage, {
				tags: getSentryTags({
					ctx,
					customerId: fullCustomer.id || "",
					alert: true,
				}),
			});

			ctx.logger.error(errMessage, {
				data: {
					customerId: fullCustomer.id,
					featureId: feature.id,
					previousUsage: previousUsage.toNumber(),
					newUsage: newUsage.toNumber(),
					previousTotalBalance: previousTotalBalance.toNumber(),
					newTotalBalance: newTotalBalance.toNumber(),
					previousCustomer: previousApiCustomer,
					newCustomer: newApiCustomer,
				},
			});
		}
	}
};

// const { data: balance } = getApiBalance({
// 	ctx,
// 	fullCus: fullCustomer,
// 	cusEnts: [cusEnt],
// 	feature: cusEnt.entitlement.feature,
// });
