import type {
	AppEnv,
	AutumnLogger,
	FullProduct,
	Organization,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { usagePriceToProductName } from "../prices/priceUtils/usagePriceUtils/convertUsagePrice.js";

/**
 * Sync a plan rename onto its owned Stripe Products (main + per-feature).
 * Callers guard variant rows — a variant shares its base's Stripe Product.
 */
export const updateStripeProductNames = async ({
	org,
	curProduct,
	newName,
	logger,
}: {
	org: Organization;
	curProduct: FullProduct;
	newName: string;
	logger: AutumnLogger;
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
		const priceStripeProdId = price.config?.stripe_product_id;

		if (priceStripeProdId) {
			const name = usagePriceToProductName({
				price,
				fullProduct: {
					...curProduct,
					name: newName,
				},
			});

			try {
				await stripeCli.products.update(priceStripeProdId, {
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
