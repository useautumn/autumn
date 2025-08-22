import {
  AttachParams,
  AttachResultSchema,
} from "../cusProducts/AttachParams.js";

import { createCheckoutMetadata } from "@/internal/metadata/metadataUtils.js";

import { isOneOff } from "@/internal/products/productUtils.js";

import { handlePaidProduct } from "../attach/attachFunctions/addProductFlow/handlePaidProduct.js";
import { AttachConfig, SuccessCode } from "@autumn/shared";
import Stripe from "stripe";
import { handleOneOffFunction } from "../attach/attachFunctions/addProductFlow/handleOneOffFunction.js";

export const handleCreateInvoiceCheckout = async ({
  req,
  res,
  attachParams,
  config,
}: {
  req: any;
  res?: any;
  attachParams: AttachParams;
  config: AttachConfig;
}) => {
  // if one off
  const { stripeCli } = attachParams;

  let invoiceResult;
  if (isOneOff(attachParams.prices)) {
    invoiceResult = await handleOneOffFunction({
      req,
      res,
      attachParams,
      config,
    });
  } else {
    invoiceResult = await handlePaidProduct({
      req,
      res,
      attachParams,
      config,
    });
  }

  const { invoices, anchorToUnix, subs }: any = invoiceResult;

  const metadataId = await createCheckoutMetadata({
    db: req.db,
    attachParams: {
      ...attachParams,
      anchorToUnix,
      subIds: subs.map((s: Stripe.Subscription) => s.id),
      config,
    } as any,
  });

  for (const invoice of invoices) {
    await stripeCli.invoices.update(invoice.id, {
      metadata: {
        autumn_metadata_id: metadataId,
      },
    });
  }

  if (res) {
    if (!config.finalizeInvoice) {
      res.status(200).json(
        AttachResultSchema.parse({
          invoice: invoices[0],
          code: SuccessCode.CheckoutCreated,
          message: `Successfully created invoice for customer ${
            attachParams.customer.id || attachParams.customer.internal_id
          }, product(s) ${attachParams.products.map((p) => p.name).join(", ")}`,
          product_ids: attachParams.products.map((p) => p.id),
          customer_id:
            attachParams.customer.id || attachParams.customer.internal_id,
        })
      );
      return;
    }
    res.status(200).json(
      AttachResultSchema.parse({
        checkout_url: invoices[0].hosted_invoice_url,
        code: SuccessCode.CheckoutCreated,
        message: `Successfully created invoice checkout for customer ${
          attachParams.customer.id || attachParams.customer.internal_id
        }, product(s) ${attachParams.products.map((p) => p.name).join(", ")}`,
        product_ids: attachParams.products.map((p) => p.id),
        customer_id:
          attachParams.customer.id || attachParams.customer.internal_id,
      })
    );
  }

  return { invoices };
};
