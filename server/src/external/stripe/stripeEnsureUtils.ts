import { DrizzleCli } from "@/db/initDrizzle.js";
import { Stripe } from "stripe";
import { checkKeyValid } from "./stripeOnboardingUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AppEnv, products } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { createStripeProduct } from "./stripeProductUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";
import { createStripeCli } from "./utils.js";

export async function ensureStripeProducts({
  db,
  logger,
  req,
}: {
  db: DrizzleCli;
  logger: any;
  req: ExtendedRequest;
}) {
  await ensureStripeProductsWithEnv({
    db,
    logger,
    req,
    env: AppEnv.Sandbox,
  });

  await ensureStripeProductsWithEnv({
    db,
    logger,
    req,
    env: AppEnv.Live,
  });
}
export async function ensureStripeProductsWithEnv({
	db,
	logger,
	req,
	env,
}: {
	db: DrizzleCli;
	logger: any;
	req: ExtendedRequest;
	env: AppEnv;
}) {
	let stripe = createStripeCli({
		org: req.org,
		env,
	});

	let existingStripeProducts = await stripe.products.list();
	let existingOrgProducts = await ProductService.listFull({
		db,
		orgId: req.org.id,
		env,
	});

  console.log("existingOrgProducts", existingOrgProducts.map((p) => p.id));
  console.log("existingStripeProducts", existingStripeProducts.data.map((p) => p.id));

	for (let existingOrgProduct of existingOrgProducts) {
		try {
			let matchFound = existingStripeProducts.data.find(
				(p) => p.id === existingOrgProduct.processor?.id
			);
      console.log("matchFound", matchFound, existingOrgProduct.processor?.id);

			if (matchFound) {
				continue;
			} else {
				await initProductInStripe({
					db,
					org: req.org,
					env,
					logger,
					product: existingOrgProduct,
				});

        console.log("created product", existingOrgProduct.id);
			}
		} catch (error) {
			logger.error(
				`Error ensuring product ${existingOrgProduct.id} in Stripe: ${error}`
			);
		}
	}
}
