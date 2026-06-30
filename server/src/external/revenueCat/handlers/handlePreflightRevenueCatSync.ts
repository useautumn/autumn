import {
	type AppEnv,
	type FullProduct,
	type Organization,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { PlanService } from "@/internal/products/PlanService";
import {
	getRevenuecatAccessToken,
	getRevenuecatProjectId,
} from "../misc/getRevenuecatAccessToken";
import { initRevenuecatCli } from "../misc/initRevenuecatCli";
import type { RevenueCatPrice, RevenueCatProduct } from "../revenuecatTypes";
import {
	getRcBasePrice,
	getRcStoreIdentifier,
} from "../sync/revenuecatProductSyncUtils";

type PreflightPrice = { amount_micros: number; currency: string };

export type PreflightItem = {
	plan_id: string;
	autumn_name: string;
	autumn_price: PreflightPrice | null;
	rc_exists: boolean;
	rc_name: string | null;
	rc_price: PreflightPrice | null;
};

/**
 * Pure assembly of the preflight diff: match each plan to its minted RC product and
 * surface Autumn's base price alongside RC's. `listPrices` is injected so this stays
 * free of network/DB — the handler wires in `rcCli.listProductPrices`.
 */
export const buildRcPreflightItems = async ({
	products,
	rcProducts,
	org,
	env,
	listPrices,
}: {
	products: FullProduct[];
	rcProducts: RevenueCatProduct[];
	org: Organization;
	env: AppEnv;
	listPrices: (rcProductId: string) => Promise<RevenueCatPrice[]>;
}): Promise<PreflightItem[]> => {
	// One RC product per store_identifier is enough to read the name + price.
	const rcByStoreId = new Map<string, RevenueCatProduct>();
	for (const rcProduct of rcProducts) {
		if (!rcByStoreId.has(rcProduct.store_identifier)) {
			rcByStoreId.set(rcProduct.store_identifier, rcProduct);
		}
	}

	return Promise.all(
		products.map(async (product) => {
			const storeId = getRcStoreIdentifier({
				env,
				orgId: org.id,
				planId: product.id,
			});
			const base = getRcBasePrice({ product, org });
			const autumn_price = base
				? { amount_micros: base.amountMicros, currency: base.currency }
				: null;

			const rcProduct = rcByStoreId.get(storeId);
			if (!rcProduct) {
				return {
					plan_id: product.id,
					autumn_name: product.name || product.id,
					autumn_price,
					rc_exists: false,
					rc_name: null,
					rc_price: null,
				};
			}

			const prices = await listPrices(rcProduct.id);
			const rc_price = prices[0]
				? { amount_micros: prices[0].amount_micros, currency: prices[0].currency }
				: null;

			return {
				plan_id: product.id,
				autumn_name: product.name || product.id,
				autumn_price,
				rc_exists: true,
				rc_name: rcProduct.display_name,
				rc_price,
			};
		}),
	);
};

/** Read-only preview of what a sync would do per plan (create/rename) + Autumn-vs-RC price divergence. */
export const handlePreflightRevenueCatSync = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const revenueCatConfig = org.processor_configs?.revenuecat;
		if (!revenueCatConfig) return c.json({ items: [] });

		const projectId = getRevenuecatProjectId({ revenueCatConfig, env });
		const accessToken = await getRevenuecatAccessToken({ db, org, env });
		if (!projectId || !accessToken) return c.json({ items: [] });

		const rcCli = initRevenuecatCli({ projectId, accessToken });
		const [products, rcProducts] = await Promise.all([
			PlanService.listFull({ db, orgId: org.id, env }),
			rcCli.listAllProducts(),
		]);

		const items = await buildRcPreflightItems({
			products,
			rcProducts,
			org,
			env,
			listPrices: (id) => rcCli.listProductPrices(id),
		});

		return c.json({ items });
	},
});
