import { AppEnv, mapToProductV2, productsAreSame } from "@autumn/shared";
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

		const sandboxProductIds = new Set(sandboxProductsV2.map((p) => p.id));
		const sandboxFeatureIds = new Set(sandboxFeatures.map((f) => f.id));
		const liveFeatureIds = new Set(liveFeatures.map((f) => f.id));

		const newFeatures = sandboxFeatures
			.filter((f) => !liveFeatureIds.has(f.id))
			.map((f) => ({ id: f.id, name: f.name }));

		const existingFeatures = sandboxFeatures
			.filter((f) => liveFeatureIds.has(f.id))
			.map((f) => ({ id: f.id, name: f.name }));

		const newProducts: { id: string; name: string }[] = [];
		const updatedProducts: { id: string; name: string }[] = [];
		const unchangedProducts: { id: string; name: string }[] = [];

		for (const sandboxProd of sandboxProductsV2) {
			const liveProd = liveProductsV2.find((p) => p.id === sandboxProd.id);

			if (!liveProd) {
				newProducts.push({ id: sandboxProd.id, name: sandboxProd.name });
				continue;
			}

			const { itemsSame, detailsSame, freeTrialsSame, optionsSame } =
				productsAreSame({
					newProductV2: sandboxProd,
					curProductV2: liveProd,
					features: sandboxFeatures,
				});

			const arr =
				itemsSame && detailsSame && freeTrialsSame && optionsSame
					? unchangedProducts
					: updatedProducts;

			arr.push({ id: sandboxProd.id, name: sandboxProd.name });
		}

		const targetOnly = liveProductsV2
			.filter((p) => !sandboxProductIds.has(p.id))
			.map((p) => ({ id: p.id, name: p.name }));

		const targetOnlyFeatures = liveFeatures
			.filter((f) => !sandboxFeatureIds.has(f.id))
			.map((f) => ({ id: f.id, name: f.name }));

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

		const customersAffected = await Promise.all(
			updatedProducts.map(async (p) => {
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
				new: newProducts,
				updated: updatedProducts,
				unchanged: unchangedProducts,
				targetOnly,
			},
			features: {
				new: newFeatures,
				existing: existingFeatures,
				targetOnly: targetOnlyFeatures,
			},
			defaultConflict,
			customersAffected: customersAffected.filter(Boolean),
		});
	},
});
