import { DrizzleCli } from "@/db/initDrizzle.js";
import { Stripe } from "stripe";
import { checkKeyValid } from "./stripeOnboardingUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AppEnv, products } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { createStripeProduct } from "./stripeProductUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";
import { createDecryptedStripeCli } from "./utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export async function ensureStripeProducts({
  db,
  logger,
  req,
  apiKeys,
}: {
  db: DrizzleCli;
  logger: any;
  req: ExtendedRequest;
  apiKeys: {
    live: string;
    test: string;
  };
}) {
  await ensureStripeProductsWithEnv({
    db,
    logger,
    req,
    env: AppEnv.Sandbox,
    apiKey: apiKeys.test,
  });

  await ensureStripeProductsWithEnv({
    db,
    logger,
    req,
    env: AppEnv.Live,
    apiKey: apiKeys.live,
  });
}
export async function ensureStripeProductsWithEnv({
	db,
	logger,
	req,
	env,
  apiKey,
}: {
	db: DrizzleCli;
	logger: any;
	req: ExtendedRequest;
	env: AppEnv;
  apiKey: string;
}) {
	let stripe = createDecryptedStripeCli({
		org: req.org,
		env,
    apiKey,
	});

	let existingStripeProducts = await stripe.products.list();
	let existingOrgProducts = await ProductService.listFull({
		db,
		orgId: req.org.id,
		env,
	});

	// Fetch updated org data to ensure we have the latest Stripe configuration
	const updatedOrg = await OrgService.get({ db, orgId: req.org.id });

	for (let existingOrgProduct of existingOrgProducts) {
		try {
			let matchFound = existingStripeProducts.data.find(
				(p) => p.id === existingOrgProduct.processor?.id
			);

			if (matchFound) {
				continue;
			} else {
				await initProductInStripe({
					db,
					org: updatedOrg,
					env,
					logger,
					product: existingOrgProduct,
				});

        logger.info(`ensured product ${existingOrgProduct.id} in Stripe during Stripe connection, env: ${env}`);
			}
		} catch (error) {
			logger.error(
				`Error ensuring product ${existingOrgProduct.id} in Stripe: ${error}`
			);
		}
	}
}
