import { AppEnv, Organization, Product } from "@autumn/shared";
import { createStripeCli } from "./utils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { StatusCodes } from "http-status-codes";

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

  if (
    !product.processor ||
    !product.processor.id ||
    product.env === AppEnv.Live
  ) {
    // Don't delete live products
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

export const deactivateStripeMeters = async ({
  org,
  env,
}: {
  org: Organization;
  env: AppEnv;
}) => {
  const stripeCli = createStripeCli({ org, env });

  const stripeMeters = await stripeCli.billing.meters.list({
    limit: 100,
    status: "active",
  });

  for (const meter of stripeMeters.data) {
    await stripeCli.billing.meters.deactivate(meter.id);
  }
};

export const deleteAllStripeProducts = async ({
  org,
  env,
}: {
  org: Organization;
  env: AppEnv;
}) => {
  const stripeCli = createStripeCli({ org, env });

  const stripeProducts = await stripeCli.products.list({
    limit: 100,
    active: true,
  });

  if (stripeProducts.data.length === 0) {
    return;
  }

  let firstProduct = stripeProducts.data[0];
  if (firstProduct.livemode) {
    throw new RecaseError({
      message: "Cannot delete livemode products",
      code: ErrCode.DeleteStripeProductFailed,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }

  let batchSize = 10;
  for (let i = 0; i < stripeProducts.data.length; i += batchSize) {
    let batch = stripeProducts.data.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (p) => {
        try {
          await stripeCli.products.del(p.id);
        } catch (error) {
          await stripeCli.products.update(p.id, {
            active: false,
          });
        }
      })
    );
    console.log(
      `Deleted ${i + batch.length}/${stripeProducts.data.length} products`
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};
