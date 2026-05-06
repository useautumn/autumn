import type { Customer } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { clearCusEntsFromCache } from "@/cron/resetCron/clearCusEntsFromCache";
import { resetCustomerEntitlement } from "@/cron/resetCron/resetCustomerEntitlement.js";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import { waitForRedisReady } from "@/external/redis/initRedis.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { cusProductToCusEnt } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getMainCusProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";

export const resetAndGetCusEnt = async ({
	ctx,
	customer,
	productGroup,
	featureId,
	skipCacheDeletion = false,
	persistFreeOverage = false,
}: {
	ctx: TestContext;
	customer: Customer;
	productGroup: string;
	featureId: string;
	skipCacheDeletion?: boolean;
	persistFreeOverage?: boolean;
}) => {
	const { db } = ctx;
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

	const { ctx: routedCtx } = getCtxWithCustomerRedis({
		ctx,
		customerId: customer.id ?? "",
	});
	await waitForRedisReady(routedCtx.redisV2, "customer-redis", 5000).catch(
		() => undefined,
	);

	const updatedCusEnt = await resetCustomerEntitlement({
		ctx: routedCtx,
		org: ctx.org,
		cusEnt: resetCusEnt,
		updatedCusEnts: [],
		persistFreeOverage,
	});

	if (!skipCacheDeletion) {
		await invalidateCachedFullSubject({
			ctx: routedCtx,
			customerId: customer.id ?? "",
			source: "resetAndGetCusEnt",
		});

		await clearCusEntsFromCache({
			cusEnts: [resetCusEnt],
		});
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
