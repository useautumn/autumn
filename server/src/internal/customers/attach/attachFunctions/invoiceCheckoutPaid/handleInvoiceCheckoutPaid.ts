import { DrizzleCli } from "@/db/initDrizzle.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { MetadataService } from "@/internal/metadata/MetadataService.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AppEnv, AttachScenario, Organization } from "@autumn/shared";
import Stripe from "stripe";

export const handleInvoiceCheckoutPaid = async ({
  req,
  org,
  env,
  db,
  stripeCli,
  invoice,
}: {
  req: ExtendedRequest;
  org: Organization;
  env: AppEnv;
  db: DrizzleCli;
  stripeCli: Stripe;
  invoice: Stripe.Invoice;
}) => {
  const metadataId = invoice.metadata?.autumn_metadata_id!;

  const metadata = await MetadataService.get({
    db,
    id: metadataId,
  });

  const { subIds, anchorToUnix, config, ...rest } = metadata?.data;
  const attachParams = rest as AttachParams;

  if (!attachParams) {
    return;
  }

  const reqMatch =
    attachParams.org.id === org.id && attachParams.customer.env === env;

  if (!reqMatch) return;

  const batchInsert = [];
  for (const product of attachParams.products) {
    batchInsert.push(
      createFullCusProduct({
        db,
        attachParams: attachToInsertParams(attachParams, product),
        subscriptionIds: subIds,
        anchorToUnix,
        carryExistingUsages: config.carryUsage,
        scenario: AttachScenario.New,
        logger: req.logger,
      })
    );
  }

  await Promise.all(batchInsert);

  req.logger.info(
    `✅ invoice.paid, successfully inserted cus products: ${attachParams.products.map((p) => p.id).join(", ")}`
  );
};
