import {
	type AppEnv,
	type CreateProductV2Params,
	mapToProductV2,
	type ProductV2,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "../../ProductService.js";
import { createProduct } from "../productActions/createProduct.js";
import { updateProduct } from "../productActions/updateProduct.js";

const conformProductToSchema = (
	product: ProductV2,
): UpdateProductV2Params & Omit<CreateProductV2Params, "version"> => {
	return {
		id: product.id,
		name: product.name,
		is_add_on: product.is_add_on,
		is_default: product.is_default,
		group: product.group ?? "",
		archived: product.archived ?? undefined,
		items: product.items,
		free_trial: product.free_trial
			? {
					length: product.free_trial.length,
					unique_fingerprint: product.free_trial.unique_fingerprint,
					duration: product.free_trial.duration,
					card_required: product.free_trial.card_required,
				}
			: null,
	};
};

export const handleCopyProducts = async ({
	ctx,
	fromEnv,
	toEnv,
}: {
	ctx: AutumnContext;
	fromEnv: AppEnv;
	toEnv: AppEnv;
}) => {
	const { db, org } = ctx;

	const [sandboxFeatures, liveFeatures, sandboxProducts, liveProducts] =
		await Promise.all([
			FeatureService.list({ db, orgId: org.id, env: fromEnv }),
			FeatureService.list({ db, orgId: org.id, env: toEnv }),
			ProductService.listFull({ db, orgId: org.id, env: fromEnv }),
			ProductService.listFull({ db, orgId: org.id, env: toEnv }),
		]);

	const liveProductsV2 = liveProducts.map((p) =>
		mapToProductV2({ product: p, features: liveFeatures }),
	);

	const sandboxProductsV2 = sandboxProducts.map((p) => {
		const productV2 = mapToProductV2({
			product: p,
			features: sandboxFeatures,
		});
		productV2.items = productV2.items.map((i) => {
			const {
				price_id: _price_id,
				entitlement_id: _ent_id,
				price_config: _price_config,
				...rest
			} = i;
			return rest;
		});

		return productV2;
	});

	const newContext = {
		...ctx,
		features: liveFeatures,
		env: toEnv,
	};

	const operations = sandboxProductsV2.map((sandboxProductV2) => {
		const liveProductV2 = liveProductsV2.find(
			(p) => p.id === sandboxProductV2.id,
		);

		const conformedProduct = conformProductToSchema(sandboxProductV2);

		if (liveProductV2) {
			return updateProduct({
				ctx: newContext,
				productId: sandboxProductV2.id,
				query: { disable_version: true },
				updates: conformedProduct,
			});
		} else {
			return createProduct({
				ctx: newContext,
				data: conformedProduct,
			});
		}
	});

	await Promise.all(operations);
};
