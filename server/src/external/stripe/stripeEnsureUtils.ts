import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { ProductService } from "@/internal/products/ProductService.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";

export async function ensureStripeProductsWithEnv({
	ctx,
}: {
	ctx: AutumnContext;
}) {
	const { db, org, env, logger } = ctx;

	// let existingStripeProducts = await stripe.products.list();
	const fullProducts = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
	});

	const stripeCli = createStripeCli({ org, env });
	// Fetch updated org data to ensure we have the latest Stripe configuration
	const products = await stripeCli.products.list({ limit: 100 });

	const batchInit: Promise<void>[] = [];
	for (const fullProduct of fullProducts) {
		const initProduct = async () => {
			const existsInStripe = products.data.find(
				(p) => p.id === fullProduct.processor?.id,
			);

			if (existsInStripe) {
				return;
			}

			try {
				await initProductInStripe({
					ctx,
					product: fullProduct,
				});

				logger.info(
					`initialized product ${fullProduct.id} in Stripe during Stripe connection, env: ${env}`,
				);
			} catch (error) {
				logger.error(`Failed to init product in stripe: ${error}`);
			}
		};

		batchInit.push(initProduct());
	}
	await Promise.all(batchInit);
}
