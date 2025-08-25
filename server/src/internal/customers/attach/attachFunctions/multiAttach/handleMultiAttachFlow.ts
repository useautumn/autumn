import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import {
  AttachBody,
  AttachConfig,
  AttachScenario,
  CusProductStatus,
  SuccessCode,
} from "@autumn/shared";
import { getCustomerSub } from "../../attachUtils/convertAttachParams.js";

import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { updateStripeSub2 } from "../upgradeFlow/updateStripeSub2.js";
import Stripe from "stripe";
import { createStripeSub2 } from "../addProductFlow/createStripeSub2.js";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { attachToInvoiceResponse } from "@/internal/invoices/invoiceUtils.js";

export const handleMultiAttachFlow = async ({
  req,
  res,
  attachParams,
  attachBody,
  config,
}: {
  req: ExtendedRequest;
  res: ExtendedResponse;
  attachParams: AttachParams;
  attachBody: AttachBody;
  config: AttachConfig;
}) => {
  // 1. Get total sub items for subscription, cancel any schedule...? or what...

  // 2. Change cus product quantities (and customer entitlements...??)

  const { db, logger } = req;
  const { stripeCli } = attachParams;
  const productsList = attachParams.productsList!;

  const { sub } = await getCustomerSub({ attachParams });
  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  let finalSub: Stripe.Subscription | null = null;

  if (sub) {
    const deleteCurSubItems = sub.items.data.map((item) => ({
      id: item.id,
      deleted: true,
    }));

    itemSet.subItems.push(...deleteCurSubItems);

    const { updatedSub } = await updateStripeSub2({
      req,
      attachParams,
      config,
      curSub: sub,
      itemSet,
      fromCreate: true,
    });

    finalSub = updatedSub;
  } else {
    if (itemSet.subItems.length > 0) {
      finalSub = await createStripeSub2({
        db,
        stripeCli,
        attachParams,
        config,
        itemSet,
      });
    }
  }

  // Expire all current cus products at the customer level
  const batchExpire: any[] = [];
  for (const cusProduct of attachParams.customer.customer_products) {
    if (cusProduct.status == CusProductStatus.Scheduled) {
      batchExpire.push(
        CusProductService.delete({
          db,
          cusProductId: cusProduct.id,
        })
      );
    } else {
      batchExpire.push(
        CusProductService.update({
          db,
          cusProductId: cusProduct.id,
          updates: {
            status: CusProductStatus.Expired,
          },
        })
      );
    }
  }

  // Expire all existing cus products at the customer level
  const batchInsert: any[] = [];
  for (const productOptions of productsList) {
    const product = attachParams.products.find(
      (p) => p.id === productOptions.product_id
    )!;

    const anchorToUnix = finalSub
      ? getLatestPeriodEnd({ sub: finalSub! }) * 1000
      : undefined;

    batchInsert.push(
      createFullCusProduct({
        db,
        attachParams: attachToInsertParams(
          attachParams,
          product,
          productOptions.entity_id || undefined
        ),
        subscriptionIds: finalSub ? [finalSub?.id!] : undefined,
        anchorToUnix,
        scenario: AttachScenario.New,
        logger,
        productOptions,
      })
    );
  }

  console.log("Running multi attach flow!");
  if (res) {
    const invoice = finalSub?.latest_invoice as Stripe.Invoice;
    res.status(200).json(
      AttachResultSchema.parse(
        AttachResultSchema.parse({
          message: `Successfully created subscriptions and attached ${attachParams.products.map((p) => p.name).join(", ")} to ${attachParams.customer.name}`,
          code: SuccessCode.NewProductAttached,
          product_ids: attachParams.products.map((p) => p.id),
          customer_id:
            attachParams.customer.id || attachParams.customer.internal_id,
          invoice: attachParams.invoiceOnly
            ? attachToInvoiceResponse({ invoice })
            : undefined,
        })
      )
    );
  }
};
