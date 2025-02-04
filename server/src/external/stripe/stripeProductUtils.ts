import { AppEnv, Organization, Product } from "@autumn/shared";
import { createStripeCli } from "./utils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";

export const createStripeProduct = async (
  org: Organization,
  env: AppEnv,
  product: Product
) => {
  try {
    const stripe = createStripeCli({ org, env });

    const stripeProduct = await stripe.products.create({
      name: product.name,
      metadata: {
        autumn_id: product.id,
        autumn_internal_id: product.internal_id,
      },
    });

    return stripeProduct;
  } catch (error: any) {
    throw new RecaseError({
      message: `Error creating product in Stripe. ${error.message}`,
      code: ErrCode.CreateStripeProductFailed,
      statusCode: 500,
    });
  }
};

export const deleteStripeProduct = async (
  org: Organization,
  env: AppEnv,
  product: Product
) => {
  const stripe = createStripeCli({ org, env });

  if (!product.processor || !product.processor.id) {
    return;
  }

  try {
    await stripe.products.del(product.processor.id);
  } catch (error) {
    throw new RecaseError({
      message: "Failed to delete stripe product",
      code: ErrCode.DeleteStripeProductFailed,
      statusCode: 500,
    });
  }
};
