import { getRevenueCatCli } from "@/external/revenueCat/misc/getRevenueCatCli";
import {
	getRevenueCatStoreIdentifierMap,
	mapRevenueCatProductToAutumn,
} from "@/external/revenueCat/misc/revenueCatCatalogMapper";
import type { RevenueCatSubscription } from "@/external/revenueCat/revenuecatTypes";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";

const subscriptionGivesAccess = (sub: RevenueCatSubscription) =>
	sub.gives_access === true ||
	sub.status === "active" ||
	sub.status === "trialing";

export type DestinationRevenueCatItems = {
	rcItemIds: Set<string>;
	autumnProductIds: Set<string>;
};

/** What RevenueCat says the destination owns right now; null when no RC client is configured. */
export const listDestinationRevenueCatProducts = async ({
	ctx,
	appUserIds,
}: {
	ctx: RevenueCatWebhookContext;
	appUserIds: string[];
}): Promise<DestinationRevenueCatItems | null> => {
	const { db, org, env, logger } = ctx;
	const handle = await getRevenueCatCli(ctx);
	if (!handle) return null;

	const { cli, isMock } = handle;
	const storeIdentifierMap = await getRevenueCatStoreIdentifierMap({
		rcCli: cli,
		orgId: org.id,
		env,
		logger,
		forceRefresh: isMock,
	});

	const items: DestinationRevenueCatItems = {
		rcItemIds: new Set(),
		autumnProductIds: new Set(),
	};

	for (const appUserId of appUserIds) {
		const [subscriptions, purchases] = await Promise.all([
			cli.listCustomerSubscriptions(appUserId),
			cli.listCustomerPurchases(appUserId),
		]);

		const holdingItems = [
			...subscriptions.filter(subscriptionGivesAccess),
			...purchases.filter((purchase) => purchase.status !== "refunded"),
		];
		for (const item of holdingItems) {
			items.rcItemIds.add(item.id);
			if (!item.product_id) continue;
			const autumnProductId = await mapRevenueCatProductToAutumn({
				db,
				orgId: org.id,
				env,
				revenueCatInternalProductId: item.product_id,
				storeIdentifierMap,
				logger,
			});
			if (autumnProductId) items.autumnProductIds.add(autumnProductId);
		}
	}

	return items;
};
