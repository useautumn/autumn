import { AppEnv, mapToProductV2, productsAreSame } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "../../ProductService.js";

type ItemChange = {
	feature_id: string;
	feature_name: string;
	old_usage: number | string | null;
	new_usage: number | string | null;
};

type PriceChange = {
	old_price: number | null;
	new_price: number | null;
};

type DefaultChange = {
	old_default: boolean;
	new_default: boolean;
};

type FreeTrialChange = {
	old_trial: { length: number; duration: string } | null;
	new_trial: { length: number; duration: string } | null;
};

type ProductChange = {
	id: string;
	name: string;
	changes?: {
		newItems: ItemChange[];
		removedItems: ItemChange[];
		priceChange: PriceChange | null;
		defaultChange: DefaultChange | null;
		freeTrialChange: FreeTrialChange | null;
	};
};

export const handlePreviewSync = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org } = ctx;
		const body = await c.req.json().catch(() => ({}));
		const fromEnv = body.from === AppEnv.Live || body.from === "live" ? AppEnv.Live : AppEnv.Sandbox;
		const toEnv = fromEnv === AppEnv.Live ? AppEnv.Sandbox : AppEnv.Live;

		const [sourceFeatures, targetFeatures, sourceProductsFull, targetProductsFull] =
			await Promise.all([
				FeatureService.list({ db, orgId: org.id, env: fromEnv }),
				FeatureService.list({ db, orgId: org.id, env: toEnv }),
				ProductService.listFull({ db, orgId: org.id, env: fromEnv }),
				ProductService.listFull({ db, orgId: org.id, env: toEnv }),
			]);

		const sourceProducts = sourceProductsFull.map((p) =>
			mapToProductV2({ product: p, features: sourceFeatures }),
		);

		const targetProducts = targetProductsFull.map((p) =>
			mapToProductV2({ product: p, features: targetFeatures }),
		);

		const sourceProductIds = new Set(sourceProducts.map((p) => p.id));
		const targetFeatureIds = new Set(targetFeatures.map((f) => f.id));

		const newFeatures = sourceFeatures
			.filter((f) => !targetFeatureIds.has(f.id))
			.map((f) => ({ id: f.id, name: f.name }));

		const sourceFeatureMap = new Map(sourceFeatures.map((f) => [f.id, f.name]));
		const targetFeatureMap = new Map(targetFeatures.map((f) => [f.id, f.name]));

		const newProducts: ProductChange[] = [];
		const updatedProducts: ProductChange[] = [];
		const unchangedProducts: ProductChange[] = [];

		for (const sourceProd of sourceProducts) {
			const targetProd = targetProducts.find((p) => p.id === sourceProd.id);

			if (!targetProd) {
				newProducts.push({
					id: sourceProd.id,
					name: sourceProd.name,
					changes: {
						newItems: sourceProd.items
							.filter((item) => item.feature_id)
							.map((item) => ({
								feature_id: item.feature_id || "",
								feature_name:
									sourceFeatureMap.get(item.feature_id || "") ||
									item.feature_id ||
									"Unknown",
								old_usage: null,
								new_usage: item.included_usage ?? null,
							})),
						removedItems: [],
						priceChange: (() => {
							const price = sourceProd.items.find((i) => !i.feature_id)?.price ?? null;
							if (price === null) return null;
							return { old_price: null, new_price: price };
						})(),
						defaultChange: sourceProd.is_default
							? { old_default: false, new_default: true }
							: null,
						freeTrialChange: sourceProd.free_trial
							? {
									old_trial: null,
									new_trial: {
										length: sourceProd.free_trial.length,
										duration: sourceProd.free_trial.duration,
									},
								}
							: null,
					},
				});
				continue;
			}

			const comparison = productsAreSame({
				newProductV2: sourceProd,
				curProductV2: targetProd,
				features: sourceFeatures,
			});

			const isUnchanged =
				comparison.itemsSame &&
				comparison.detailsSame &&
				comparison.freeTrialsSame &&
				comparison.optionsSame;

			if (isUnchanged) {
				unchangedProducts.push({ id: sourceProd.id, name: sourceProd.name });
			} else {
				updatedProducts.push({
					id: sourceProd.id,
					name: sourceProd.name,
					changes: {
						newItems: comparison.newItems
						.filter((item) => item.feature_id)
						.map((item) => {
							const targetItem = targetProd.items.find((i) => i.feature_id === item.feature_id);
							return {
								feature_id: item.feature_id || "",
								feature_name:
									sourceFeatureMap.get(item.feature_id || "") ||
									targetFeatureMap.get(item.feature_id || "") ||
									item.feature_id ||
									"Unknown",
								old_usage: targetItem?.included_usage ?? null,
								new_usage: item.included_usage ?? null,
							};
						}),
					removedItems: comparison.removedItems
						.filter((item) => item.feature_id)
						.map((item) => ({
							feature_id: item.feature_id || "",
							feature_name:
								targetFeatureMap.get(item.feature_id || "") ||
								sourceFeatureMap.get(item.feature_id || "") ||
								item.feature_id ||
								"Unknown",
							old_usage: item.included_usage ?? null,
							new_usage: null,
						})),
						priceChange: (() => {
							const priceChanged = !comparison.onlyEntsChanged && !comparison.itemsSame;
							if (!priceChanged) return null;
							const sourcePrice = sourceProd.items.find((i) => !i.feature_id)?.price ?? null;
							const targetPrice = targetProd.items.find((i) => !i.feature_id)?.price ?? null;
							if (sourcePrice === targetPrice) return null;
							return { old_price: targetPrice, new_price: sourcePrice };
						})(),
						defaultChange: sourceProd.is_default !== targetProd.is_default
							? { old_default: targetProd.is_default, new_default: sourceProd.is_default }
							: null,
						freeTrialChange: (() => {
							if (comparison.freeTrialsSame) return null;
							const oldTrial = targetProd.free_trial
								? { length: targetProd.free_trial.length, duration: targetProd.free_trial.duration }
								: null;
							const newTrial = sourceProd.free_trial
								? { length: sourceProd.free_trial.length, duration: sourceProd.free_trial.duration }
								: null;
							return { old_trial: oldTrial, new_trial: newTrial };
						})(),
					},
				});
			}
		}

		const targetOnly = targetProducts
			.filter((p) => !sourceProductIds.has(p.id))
			.map((p) => ({ id: p.id, name: p.name }));

		const sourceDefault = sourceProducts.find((p) => p.is_default);
		const targetDefault = targetProducts.find((p) => p.is_default);
		const defaultConflict =
			sourceDefault && targetDefault && sourceDefault.id !== targetDefault.id
				? { source: sourceDefault.name, target: targetDefault.name }
				: null;

		const customersAffected = await Promise.all(
			updatedProducts.map(async (p) => {
				const targetProduct = targetProductsFull.find((tp) => tp.id === p.id);
				if (!targetProduct) return null;

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
			features: { new: newFeatures },
			defaultConflict,
			customersAffected: customersAffected.filter(Boolean),
		});
	},
});
