import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  AttachParams,
  AttachResultSchema,
} from "../../../cusProducts/AttachParams.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

import {
  APIVersion,
  AttachConfig,
  AttachScenario,
  CusProductStatus,
  ProcessorType,
  SuccessCode,
} from "@autumn/shared";

import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import { updateStripeSubs } from "./updateStripeSubs.js";

export const handleUpgradeFunction = async ({
  req,
  res,
  attachParams,
  config,
}: {
  req: ExtendedRequest;
  res: any;
  attachParams: AttachParams;
  config: AttachConfig;
}) => {
  const logger = req.logtail;
  const { stripeCli, customer, products, cusProducts } = attachParams;
  const { carryUsage, disableTrial, proration } = config;

  const product = products[0];

  let { curMainProduct: curCusProduct } = getExistingCusProducts({
    product,
    cusProducts: cusProducts || [],
    internalEntityId: attachParams.internalEntityId,
  });

  curCusProduct = curCusProduct!;

  const stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct.subscription_ids,
    expand: ["items.data.price.tiers"],
  });

  logger.info("1. Updating current subscriptions in Stripe");
  let { newSubs, invoice, newInvoiceIds } = await updateStripeSubs({
    db: req.db,
    curCusProduct,
    stripeCli,
    attachParams,
    stripeSubs,
    logger,
    config,
  });

  logger.info("3. Expiring old cus product");
  await CusProductService.update({
    db: req.db,
    cusProductId: curCusProduct.id,
    updates: {
      subscription_ids: curCusProduct.subscription_ids!.filter(
        (subId) => subId !== newSubs[0].id,
      ),
      processor: {
        type: ProcessorType.Stripe,
        subscription_id: null,
      },
      status: CusProductStatus.Expired,
    },
  });

  // Insert new cus product
  logger.info("4. Creating new cus product");
  await createFullCusProduct({
    db: req.db,
    attachParams: attachToInsertParams(attachParams, products[0]),
    subscriptionIds: newSubs.map((sub) => sub.id),

    anchorToUnix:
      newSubs.length > 0 ? newSubs[0].current_period_end * 1000 : undefined,

    disableFreeTrial: disableTrial,
    carryExistingUsages: carryUsage,
    carryOverTrial: true,
    scenario: AttachScenario.Upgrade,
    logger,
  });

  // Insert invoices
  logger.info("5. Inserting invoices");
  const batchInsertInvoice = [];
  for (const invoiceId of newInvoiceIds || []) {
    batchInsertInvoice.push(
      insertInvoiceFromAttach({
        db: req.db,
        attachParams,
        invoiceId,
        logger,
      }),
    );
  }

  await Promise.all(batchInsertInvoice);

  let curProductName = curCusProduct.product.name;

  if (res) {
    let apiVersion = attachParams.apiVersion || APIVersion.v1;

    if (apiVersion >= APIVersion.v1_1) {
      res.status(200).json(
        AttachResultSchema.parse({
          customer_id: customer.id,
          product_ids: products.map((p) => p.id),
          code: SuccessCode.UpgradedToNewProduct,
          message: `Successfully upgraded from ${curProductName} to ${product.name}`,
          invoice: config.invoiceOnly ? invoice : undefined,
        }),
      );
    } else {
      res.status(200).json({
        success: true,
        message: `Successfully upgraded from ${curProductName} to ${product.name}`,
      });
    }
  }
};
