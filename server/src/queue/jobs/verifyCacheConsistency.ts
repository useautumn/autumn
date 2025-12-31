import { CusExpand } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { getApiCustomerBase } from "../../internal/customers/cusUtils/apiCusUtils/getApiCustomerBase";

export const verifyCacheConsistency = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: {
		customerId: string;
		orgId: string;
		env: string;
		source: string;
	};
}) => {
	const { customerId, source } = payload;
	const { db, org, env, logger } = ctx;

	// Get from cache
	const { apiCustomer: cachedCustomer } = await getCachedApiCustomer({
		ctx,
		customerId,
		source: "verify",
	});

	// Get fresh from DB
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		withEntities: true,
		withSubs: true,
		expand: [CusExpand.Invoices],
	});

	const { apiCustomer: dbCustomer } = await getApiCustomerBase({
		ctx,
		fullCus,
		withAutumnId: true,
	});

	// 1. Check if products match
	const checkProductsMatch = () => {
		for (const subscription of dbCustomer.subscriptions) {
			const cachedSubscription = cachedCustomer.subscriptions.find(
				(s) => s.plan_id === subscription.plan_id,
			);

			if (!cachedSubscription) return false;
		}

		for (const scheduledSubscription of dbCustomer.scheduled_subscriptions) {
			const cachedScheduledSubscription =
				cachedCustomer.scheduled_subscriptions.find(
					(s) => s.plan_id === scheduledSubscription.plan_id,
				);

			if (!cachedScheduledSubscription) return false;
		}
	};

	// if (productMismatch) {
	// 	logger.error(
	// 		"[VerifyCacheConsistency] Cache inconsistency detected! Auto-fixing...",
	// 		{
	// 			data: {
	// 				customerId,
	// 				source,
	// 				cached: [...cachedProductIds],
	// 				fresh: [...freshProductIds],
	// 			},
	// 		},
	// 	);

	// 	// Auto-fix by deleting cache (next read will repopulate)
	// 	await deleteCachedApiCustomer({
	// 		customerId,
	// 		orgId: org.id,
	// 		env,
	// 		source: "verification-auto-fix",
	// 	});

	// 	logger.info(
	// 		`[VerifyCacheConsistency] Cache cleared for ${customerId}, will repopulate on next read`,
	// 	);
	// } else {
	// 	logger.info(
	// 		`[VerifyCacheConsistency] Cache is consistent for ${customerId}`,
	// 	);
	// }
};
