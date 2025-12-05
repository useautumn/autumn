import { AppEnv, mapToProductV2 } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "../../ProductService.js";

export const handlePreviewSync = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org } = ctx;

		const fromEnv = AppEnv.Sandbox;
		const toEnv = AppEnv.Live;

		const [sandboxFeatures, liveFeatures, sandboxProducts, liveProducts] =
			await Promise.all([
				FeatureService.list({ db, orgId: org.id, env: fromEnv }),
				FeatureService.list({ db, orgId: org.id, env: toEnv }),
				ProductService.listFull({ db, orgId: org.id, env: fromEnv }),
				ProductService.listFull({ db, orgId: org.id, env: toEnv }),
			]);

		const sandboxProductsV2 = sandboxProducts.map((p) =>
			mapToProductV2({ product: p, features: sandboxFeatures }),
		);

		const liveProductsV2 = liveProducts.map((p) =>
			mapToProductV2({ product: p, features: liveFeatures }),
		);

		const sandboxIds = new Set(sandboxProductsV2.map((p) => p.id));
		const liveIds = new Set(liveProductsV2.map((p) => p.id));

		const toSync = sandboxProductsV2.map((p) => ({ id: p.id, name: p.name }));

		const targetOnly = liveProductsV2
			.filter((p) => !sandboxIds.has(p.id))
			.map((p) => ({ id: p.id, name: p.name }));

		const sandboxDefault = sandboxProductsV2.find((p) => p.is_default);
		const liveDefault = liveProductsV2.find((p) => p.is_default);

		let defaultConflict = null;
		if (
			sandboxDefault &&
			liveDefault &&
			sandboxDefault.id !== liveDefault.id
		) {
			defaultConflict = {
				source: sandboxDefault.name,
				target: liveDefault.name,
			};
		}

		const productsToUpdate = sandboxProductsV2.filter((p) => liveIds.has(p.id));
		const customersAffected = await Promise.all(
			productsToUpdate.map(async (p) => {
				const liveProduct = liveProducts.find((lp) => lp.id === p.id);
				if (!liveProduct) return null;

				const counts = await CusProdReadService.getCountsForAllVersions({
					db,
					productId: p.id,
					orgId: org.id,
					env: toEnv,
				});

				const customerCount = Number(counts?.active) || 0;
				if (customerCount === 0) return null;

				return {
					productId: p.id,
					productName: p.name,
					customerCount,
				};
			}),
		);

		return c.json({
			products: {
				toSync,
				targetOnly,
			},
			defaultConflict,
			customersAffected: customersAffected.filter(Boolean),
		});
	},
});
