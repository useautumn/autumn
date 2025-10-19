import {
	type AppEnv,
	type CreateFreeTrial,
	type FreeTrial,
	type FullProduct,
	isFreeProductV2,
	type Organization,
	type Product,
	type ProductItem,
	RecaseError,
	type RewardProgram,
	type UpdateProduct,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { ProductService } from "../../ProductService.js";
import { usagePriceToProductName } from "../../prices/priceUtils/usagePriceUtils/convertUsagePrice.js";
import {
	isFeaturePriceItem,
	isPriceItem,
} from "../../product-items/productItemUtils/getItemType.js";
import { isFreeProduct } from "../../productUtils.js";

const productDetailsSame = (prod1: Product, prod2: UpdateProduct) => {
	if (notNullish(prod2.id) && prod1.id !== prod2.id) {
		return false;
	}

	if (notNullish(prod2.name) && prod1.name !== prod2.name) {
		return false;
	}

	if (notNullish(prod2.group) && prod1.group !== prod2.group) {
		return false;
	}

	if (notNullish(prod2.is_add_on) && prod1.is_add_on !== prod2.is_add_on) {
		return false;
	}

	if (notNullish(prod2.is_default) && prod1.is_default !== prod2.is_default) {
		return false;
	}

	if (notNullish(prod2.archived) && prod1.archived !== prod2.archived) {
		return false;
	}

	return true;
};

const updateStripeProductNames = async ({
	db,
	org,
	curProduct,
	newName,
	logger,
}: {
	db: DrizzleCli;
	org: Organization;
	curProduct: FullProduct;
	newName: string;
	logger: any;
}) => {
	if (!isStripeConnected({ org, env: curProduct.env as AppEnv })) return;

	const stripeCli = createStripeCli({
		org,
		env: curProduct.env as AppEnv,
	});
	const stripeProdId = curProduct.processor?.id;

	if (!stripeProdId || !newName) {
		return;
	}

	try {
		await stripeCli.products.update(stripeProdId, {
			name: newName,
		});
	} catch (error: any) {
		logger.error(
			`Error updating product ${curProduct.id} name in Stripe: ${error.message}`,
			{
				error,
				stripeProdId,
				newName,
			},
		);
	}

	for (const price of curProduct.prices) {
		const stripeProdId = price.config?.stripe_product_id;

		if (stripeProdId) {
			const name = usagePriceToProductName({
				price,
				fullProduct: {
					...curProduct,
					name: newName,
				},
			});

			try {
				await stripeCli.products.update(stripeProdId, {
					name,
				});
			} catch (error: any) {
				logger.error(
					`Error updating price ${price.id} name in Stripe: ${error.message}`,
				);
			}
		}
	}
};

const willBeDefaultTrial = ({
	newProduct,
	curProduct,
	newFreeTrial,
	newItems,
}: {
	newProduct: UpdateProduct;
	curProduct: FullProduct;
	newFreeTrial?: FreeTrial | CreateFreeTrial;
	newItems: ProductItem[];
}) => {
	// 1. Get final default
	const finalDefault = notNullish(newProduct.is_default)
		? newProduct.is_default
		: curProduct.is_default;

	const finalFreeTrial = notNullish(newFreeTrial)
		? newFreeTrial
		: curProduct.free_trial;

	const finalIsFree = notNullish(newItems)
		? isFreeProductV2({ items: newItems })
		: isFreeProduct(curProduct.prices);

	return finalDefault && !finalIsFree && finalFreeTrial;
};

export const handleUpdateProductDetails = async ({
	db,
	newProduct,
	curProduct,
	newFreeTrial,
	items,
	org,
	rewardPrograms,
	logger,
}: {
	db: DrizzleCli;
	curProduct: FullProduct;
	newProduct: UpdateProduct;
	newFreeTrial?: FreeTrial | CreateFreeTrial;
	items: ProductItem[];
	org: Organization;
	rewardPrograms: RewardProgram[];
	logger: any;
}) => {
	const customersOnAllVersions = await CusProductService.getByProductId({
		db,
		productId: curProduct.id,
		orgId: org.id,
		env: curProduct.env as AppEnv,
	});

	// Should error if:
	// - New product is a default product
	// - Org is not allowed to have paid default products
	// - Current product is not a default trial

	// Final prices are curProduct.prices or newProduct.prices

	if (
		newProduct.is_default &&
		!org.config.allow_paid_default &&
		!willBeDefaultTrial({
			newProduct,
			curProduct,
			newFreeTrial,
			newItems: items,
		})
	) {
		// 1. Check if there are items
		if (items) {
			if (items.some((item) => isFeaturePriceItem(item) || isPriceItem(item))) {
				throw new RecaseError({
					message:
						"Cannot make a product default if it has fixed prices or paid features",
				});
			}
		} else {
			if (!isFreeProduct(curProduct.prices)) {
				throw new RecaseError({
					message:
						"Cannot make a product default if it has fixed prices or paid features",
				});
			}
		}
	}

	if (productDetailsSame(curProduct, newProduct)) {
		return;
	}

	if (notNullish(newProduct.id) && newProduct.id !== curProduct.id) {
		if (customersOnAllVersions.length > 0) {
			throw new RecaseError({
				message: "Cannot change product ID because it has existing customers",
			});
		}

		if (rewardPrograms.length > 0) {
			throw new RecaseError({
				message:
					"Cannot change product ID because existing reward programs are linked to it",
			});
		}
	}

	// 2. Update product
	await ProductService.updateByInternalId({
		db,
		internalId: curProduct.internal_id,
		update: {
			id: newProduct.id,
			name: newProduct.name,
			group: newProduct.group,
			is_add_on: newProduct.is_add_on,
			is_default: newProduct.is_default,
			archived: newProduct.archived,
		},
	});

	// Update product name in Stripe
	if (curProduct.name !== newProduct.name && notNullish(newProduct.name)) {
		logger.info(
			`Updating product (${curProduct.id}) name in Stripe to ${newProduct.name}`,
		);
		await updateStripeProductNames({
			db,
			org,
			curProduct,
			newName: newProduct.name!,
			logger,
		});
	}

	curProduct.name = newProduct.name || curProduct.name;
	curProduct.group = newProduct.group || curProduct.group;
	curProduct.is_add_on = newProduct.is_add_on ?? curProduct.is_add_on;
	curProduct.is_default = newProduct.is_default ?? curProduct.is_default;
	curProduct.archived = newProduct.archived ?? curProduct.archived;
};
