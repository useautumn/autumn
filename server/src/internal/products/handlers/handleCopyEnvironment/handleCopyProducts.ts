import {
	type AppEnv,
	type CreateProductV2Params,
	mapToProductV2,
	type Organization,
	type ProductV2,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { createProduct } from "../../../product/actions/createProduct.js";
import { updateProduct } from "../../../product/actions/updateProduct.js";
import { ProductService } from "../../ProductService.js";

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
					on_end: product.free_trial.on_end,
				}
			: null,
	};
};

/**
 * Copies products from one (org, env) into another (org, env).
 *
 * Generalised from the original sandbox→live copy so the source and target may
 * be different organizations (e.g. two sandbox sub-orgs of the same master
 * org). Processor-specific ids (price/entitlement ids, price_config) are
 * stripped so the target gets a clean copy, and the write context is rebuilt
 * around an explicit `toOrg`/`toEnv`.
 */
export const handleCopyProducts = async ({
	ctx,
	fromOrg,
	fromEnv,
	toOrg,
	toEnv,
}: {
	ctx: AutumnContext;
	fromOrg: Organization;
	fromEnv: AppEnv;
	toOrg: Organization;
	toEnv: AppEnv;
}) => {
	const { db } = ctx;

	const [fromFeatures, toFeatures, fromProducts, toProducts] =
		await Promise.all([
			FeatureService.list({ db, orgId: fromOrg.id, env: fromEnv }),
			FeatureService.list({ db, orgId: toOrg.id, env: toEnv }),
			ProductService.listFull({ db, orgId: fromOrg.id, env: fromEnv }),
			ProductService.listFull({ db, orgId: toOrg.id, env: toEnv }),
		]);

	const toProductsV2 = toProducts.map((p) =>
		mapToProductV2({ product: p, features: toFeatures }),
	);

	const fromProductsV2 = fromProducts.map((p) => {
		const productV2 = mapToProductV2({
			product: p,
			features: fromFeatures,
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
		org: toOrg,
		features: toFeatures,
		env: toEnv,
	};

	const operations = fromProductsV2.map((fromProductV2) => {
		const toProductV2 = toProductsV2.find((p) => p.id === fromProductV2.id);

		const conformedProduct = conformProductToSchema(fromProductV2);

		if (toProductV2) {
			return updateProduct({
				ctx: newContext,
				productId: fromProductV2.id,
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
