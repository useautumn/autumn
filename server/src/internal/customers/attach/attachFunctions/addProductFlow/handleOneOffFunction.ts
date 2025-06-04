import { AttachResultSchema } from "@/internal/customers/cusProducts/AttachParams.js";
import { AttachScenario, UsagePriceConfig } from "@autumn/shared";
import { SuccessCode } from "@autumn/shared";

import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { newPriceToInvoiceDescription } from "@/internal/invoices/invoiceFormatUtils.js";
import { getPriceOptions } from "@/internal/products/prices/priceUtils.js";
import { priceToProduct } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/getAmountForPrice.js";
import { AttachConfig } from "@autumn/shared";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import { Decimal } from "decimal.js";

export const handleOneOffFunction = async ({
  req,
  attachParams,
  config,
  res,
}: {
  req: any;
  attachParams: AttachParams;
  config: AttachConfig;
  res: any;
}) => {
  const logger = req.logtail;
  logger.info("Scenario 4A: One-off prices");

  const {
    stripeCli,
    paymentMethod,
    org,
    customer,
    products,
    prices,
    optionsList,
  } = attachParams;

  const { invoiceOnly } = config;

  let invoiceItems = [];

  for (const price of prices) {
    const options = getPriceOptions(price, optionsList);
    let quantity = options?.quantity;

    if (quantity) {
      let config = price.config as UsagePriceConfig;
      quantity = new Decimal(quantity)
        .mul(config.billing_units || 1)
        .toNumber();
    }

    const amount = priceToInvoiceAmount({
      price,
      quantity,
    });

    const product = priceToProduct({
      price,
      products,
    });

    const description = newPriceToInvoiceDescription({
      org,
      price,
      product: product!,
      quantity: options?.quantity,
      withProductPrefix: true,
    });

    invoiceItems.push({
      description,
      price_data: {
        unit_amount: amount * 100,
        currency: org.default_currency,
        product: price.config?.stripe_product_id || product?.processor?.id!,
      },
      quantity: 1,
    });
  }

  // Create invoice
  logger.info("1. Creating invoice");
  const stripeInvoice = await stripeCli.invoices.create({
    customer: customer.processor.id,
    auto_advance: false,
    currency: org.default_currency,
  });

  logger.info("2. Creating invoice items");
  for (const invoiceItem of invoiceItems) {
    await stripeCli.invoiceItems.create({
      ...invoiceItem,
      customer: customer.processor.id,
      invoice: stripeInvoice.id,
    });
  }

  // Create invoice items
  if (!invoiceOnly) {
    await stripeCli.invoices.finalizeInvoice(stripeInvoice.id);

    logger.info("3. Paying invoice");
    const { paid, error } = await payForInvoice({
      stripeCli,
      invoiceId: stripeInvoice.id,
      paymentMethod,
      logger,
      errorOnFail: false,
      voidIfFailed: true,
    });

    if (!paid) {
      if (org.config.checkout_on_failed_payment) {
        return await handleCreateCheckout({
          req,
          res,
          attachParams,
        });
      }
      throw error;
    }
  }

  logger.info("4. Creating full customer product");
  const batchInsert = [];
  for (const product of products) {
    batchInsert.push(
      createFullCusProduct({
        db: req.db,
        attachParams: attachToInsertParams(attachParams, product),
        lastInvoiceId: stripeInvoice.id,
        logger,
      }),
    );
  }
  await Promise.all(batchInsert);

  logger.info("5. Creating invoice from stripe");
  await insertInvoiceFromAttach({
    db: req.db,
    attachParams,
    invoiceId: stripeInvoice.id,
    logger,
  });

  if (res) {
    const productNames = products.map((p) => p.name).join(", ");
    const customerName = customer.name || customer.email || customer.id;
    res.status(200).json(
      AttachResultSchema.parse({
        success: true,
        message: `Successfully purchased ${productNames} and attached to ${customerName}`,
        invoice: invoiceOnly ? stripeInvoice : undefined,
        code: SuccessCode.OneOffProductAttached,
        product_ids: products.map((p) => p.id),
        customer_id: customer.id || customer.internal_id,
        scenario: AttachScenario.New,
      }),
    );
  }
};

// // 2. Create invoice items
// for (const price of prices) {
//   // Calculate amount
//   const options = getPriceOptions(price, optionsList);
//   const entitlement = getPriceEntitlement(price, entitlements);
//   const amount = getPriceAmount({
//     price,
//     options,
//     relatedEnt: entitlement,
//   });

//   let allowanceStr = "";
//   if (entitlement) {
//     allowanceStr = ` - ${entitlement.feature.name}`;
//   }

//   let product = getProductForPrice(price, products);

//   let amountData = {};
//   let billingType = getBillingType(price.config!);

//   if (billingType == BillingType.OneOff) {
//     amountData = {
//       price: price.config?.stripe_price_id,
//     };
//   } else {
//     amountData = {
//       amount: amount * 100,
//       currency: org.default_currency,
//     };
//   }

//   // let previewData = {};
//   // if (shouldPreview) {
//   //   previewData = {
//   //     ...priceToAmountOrTiers(price),
//   //     usage_model:
//   //       billingType == BillingType.UsageInAdvance
//   //         ? UsageModel.Prepaid
//   //         : price.config?.type == PriceType.Usage
//   //           ? UsageModel.PayPerUse
//   //           : null,
//   //     feature_name: entitlement?.feature.name,
//   //   };
//   // }

//   invoiceItems.push({
//     description: `${product?.name}${allowanceStr}`,
//     ...amountData,
//     ...previewData,
//   });

//   autumnInvoiceItems.push({
//     price_id: price.id!,
//     description: `${product?.name}${allowanceStr}`,
//     internal_feature_id: entitlement?.feature.internal_id || null,
//     period_start: Date.now(),
//     period_end: Date.now(),
//     stripe_id: "",
//   });
// }

// // if (shouldPreview) {
// //   return autumnInvoiceItems;
// // }

// // logger.info("   1. Creating invoice");
// // let stripeInvoice = await stripeCli.invoices.create({
// //   customer: customer.processor.id,
// //   auto_advance: false,
// //   currency: org.default_currency,
// // });

// // logger.info("   2. Creating invoice items");
// // for (let i = 0; i < invoiceItems.length; i++) {
// //   let invoiceItem = invoiceItems[i];
// //   let stripeInvoiceItem = await stripeCli.invoiceItems.create({
// //     ...invoiceItem,
// //     customer: customer.processor.id,
// //     invoice: stripeInvoice.id,
// //   });

// //   autumnInvoiceItems[i] = {
// //     ...autumnInvoiceItems[i],
// //     stripe_id: stripeInvoiceItem.id,
// //   };
// // }

// // if (!attachParams.invoiceOnly) {
// //   stripeInvoice = await stripeCli.invoices.finalizeInvoice(
// //     stripeInvoice.id,
// //     getInvoiceExpansion(),
// //   );

// //   logger.info("   3. Paying invoice");
// //   const { paid, error } = await payForInvoice({
// //     fullOrg: org,
// //     env: customer.env,
// //     customer: customer,
// //     invoice: stripeInvoice,
// //     logger,
// //   });

// //   if (!paid) {
// //     await stripeCli.invoices.voidInvoice(stripeInvoice.id);
// //     if (fromRequest && org.config.checkout_on_failed_payment) {
// //       await handleCreateCheckout({
// //         req,
// //         res,
// //         attachParams,
// //       });
// //       return;
// //     } else {
// //       throw error;
// //     }
// //   }
// // }

// // // Insert full customer product
// // logger.info("   4. Creating full customer product");
// // const batchInsert = [];
// // for (const product of products) {
// //   batchInsert.push(
// //     createFullCusProduct({
// //       db: req.db,
// //       attachParams: attachToInsertParams(attachParams, product),
// //       lastInvoiceId: stripeInvoice.id,
// //       logger,
// //     }),
// //   );
// // }
// // await Promise.all(batchInsert);

// // logger.info("   5. Creating invoice from stripe");
// // await InvoiceService.createInvoiceFromStripe({
// //   db: req.db,
// //   stripeInvoice: stripeInvoice,
// //   internalCustomerId: customer.internal_id,
// //   internalEntityId: attachParams.internalEntityId,
// //   productIds: products.map((p) => p.id),
// //   internalProductIds: products.map((p) => p.internal_id),
// //   org: org,
// //   items: autumnInvoiceItems,
// // });

// // logger.info("   ✅ Successfully attached product");

// // if (fromRequest) {
// //   res.status(200).json(
// //     AttachResultSchema.parse({
// //       success: true,
// //       message: `Successfully purchased ${products
// //         .map((p) => p.name)
// //         .join(", ")} and attached to ${customer.name}`,
// //       invoice: invoiceOnly ? stripeInvoice : undefined,

// //       code: SuccessCode.OneOffProductAttached,
// //       product_ids: products.map((p) => p.id),
// //       customer_id: customer.id || customer.internal_id,
// //       scenario: AttachScenario.New,
// //     }),
// //   );
// // }
