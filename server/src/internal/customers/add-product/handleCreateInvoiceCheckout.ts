import RecaseError from "@/utils/errorUtils.js";
import {
  AttachParams,
  AttachResultSchema,
} from "../cusProducts/AttachParams.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { createCheckoutMetadata } from "@/internal/metadata/metadataUtils.js";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { ErrCode } from "@/errors/errCodes.js";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import { attachParamsToProduct } from "../attach/attachUtils/convertAttachParams.js";
import { handlePaidProduct } from "../attach/attachFunctions/addProductFlow/handlePaidProduct.js";
import {
  AttachBranch,
  AttachConfig,
  ProrationBehavior,
  SuccessCode,
} from "@autumn/shared";
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

  // AttachResultSchema.parse({
  //   checkout_url: checkout.url,
  //   code: SuccessCode.CheckoutCreated,
  //   message: `Successfully created checkout for customer ${
  //     customer.id || customer.internal_id
  //   }, product(s) ${attachParams.products.map((p) => p.name).join(", ")}`,
  //   product_ids: attachParams.products.map((p) => p.id),
  //   customer_id: customer.id || customer.internal_id,
  // });
  if (res) {
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
