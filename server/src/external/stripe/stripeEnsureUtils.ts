import type { AppEnv, Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";

export async function ensureStripeProducts({
	db,
	logger,
	req,
	org,
	env,
}: {
	db: DrizzleCli;
	logger: any;
	req: ExtendedRequest;
	org: Organization;
	env: AppEnv;
}) {
	await ensureStripeProductsWithEnv({
		db,
		logger,
		req,
		env,
		org,
	});
}
export async function ensureStripeProductsWithEnv({
	db,
	logger,
	req,
	env,
	org,
}: {
	db: DrizzleCli;
	logger: any;
	req: ExtendedRequest;
	env: AppEnv;
	org: Organization;
}) {
	// let existingStripeProducts = await stripe.products.list();
	const fullProducts = await ProductService.listFull({
		db,
		orgId: req.org.id,
		env,
	});

	const stripeCli = createStripeCli({ org, env });

	// Fetch updated org data to ensure we have the latest Stripe configuration
	const products = await stripeCli.products.list({ limit: 100 });
	const updatedOrg = await OrgService.get({ db, orgId: req.org.id });

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
					db,
					org: updatedOrg,
					env,
					logger,
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
