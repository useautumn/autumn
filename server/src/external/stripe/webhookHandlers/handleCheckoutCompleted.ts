import { Stripe } from "stripe";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getMetadataFromCheckoutSession } from "@/internal/metadata/metadataUtils.js";
import {
  AppEnv,
  AttachScenario,
  CusProductStatus,
  Organization,
} from "@autumn/shared";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { createStripeCli } from "../utils.js";

import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { handleCheckoutSub } from "./handleCheckoutCompleted/handleCheckoutSub.js";
import { handleRemainingSets } from "./handleCheckoutCompleted/handleRemainingSets.js";
import { getOptionsFromCheckoutSession } from "./handleCheckoutCompleted/getOptionsFromCheckout.js";
import { getEarliestPeriodEnd } from "../stripeSubUtils/convertSubUtils.js";

export const handleCheckoutSessionCompleted = async ({
  req,
  db,
  org,
  data,
  env,
  logger,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  org: Organization;
  data: Stripe.Checkout.Session;
  env: AppEnv;
  logger: any;
}) => {
  const metadata = await getMetadataFromCheckoutSession(data, db);
  if (!metadata) {
    console.log("checkout.completed: metadata not found, skipping");
    return;
  }

  // Get options
  const stripeCli = createStripeCli({ org, env });
  const attachParams: AttachParams = metadata.data;
  const checkoutSession = await stripeCli.checkout.sessions.retrieve(data.id, {
    expand: ["line_items", "subscription"],
  });

  attachParams.req = req;
  attachParams.stripeCli = stripeCli;

  if (attachParams.org.id != org.id) {
    console.log("checkout.completed: org doesn't match, skipping");
    return;
  }

  if (attachParams.customer.env != env) {
    console.log("checkout.completed: environments don't match, skipping");
    return;
  }

  await getOptionsFromCheckoutSession({
    checkoutSession,
    attachParams,
  });

  console.log(
    "Handling checkout.completed: autumn metadata:",
    checkoutSession.metadata?.autumn_metadata_id
  );

  const checkoutSub =
    checkoutSession.subscription as Stripe.Subscription | null;

  if (checkoutSub) {
    const activeCusProducts = await CusProductService.getByStripeSubId({
      db,
      stripeSubId: checkoutSub.id,
      orgId: org.id,
      env,
      inStatuses: [CusProductStatus.Active],
    });

    if (activeCusProducts && activeCusProducts.length > 0) {
      console.log("✅ checkout.completed: subscription already exists");
      return true;
    }
  }

  await handleCheckoutSub({
    stripeCli,
    db,
    subscription: checkoutSub,
    attachParams,
    logger,
  });

  // Create other subscriptions
  const { invoiceIds } = await handleRemainingSets({
    stripeCli,
    db,
    org,
    checkoutSession,
    attachParams,
    checkoutSub,
    logger,
  });

  const products = attachParams.products;

  for (const product of products) {
    const anchorToUnix = checkoutSub
      ? getEarliestPeriodEnd({ sub: checkoutSub! }) * 1000
      : undefined;
    await createFullCusProduct({
      db,
      attachParams: attachToInsertParams(attachParams, product),
      subscriptionIds: checkoutSub ? [checkoutSub?.id!] : undefined,
      anchorToUnix,
      scenario: AttachScenario.New,
      logger,
    });
  }

  console.log("✅ checkout.completed: successfully created cus product");
  const batchInsertInvoice: any = [];

  for (const invoiceId of invoiceIds) {
    batchInsertInvoice.push(
      insertInvoiceFromAttach({
        db,
        attachParams,
        invoiceId,
        logger,
      })
    );
  }

  await Promise.all(batchInsertInvoice);
  console.log("✅ checkout.completed: successfully inserted invoices");

  for (const product of attachParams.products) {
    await addTaskToQueue({
      jobName: JobName.TriggerCheckoutReward,
      payload: {
        customer: attachParams.customer,
        product,
        org,
        env: attachParams.customer.env,
        subId: checkoutSub?.id as string,
      },
    });
  }

  return;
};

// for (const invoiceId of invoiceIds) {
//   try {
//     const invoice = await getStripeExpandedInvoice({
//       stripeCli,
//       stripeInvoiceId: invoiceId,
//     });

//     let invoiceItems = await getInvoiceItems({
//       stripeInvoice: invoice,
//       prices: attachParams.prices,
//       logger,
//     });

//     await InvoiceService.createInvoiceFromStripe({
//       db,
//       org,
//       stripeInvoice: invoice,
//       internalCustomerId: attachParams.customer.internal_id,
//       productIds: products.map((p) => p.id),
//       internalProductIds: products.map((p) => p.internal_id),
//       internalEntityId: attachParams.internalEntityId,
//       items: invoiceItems,
//     });

//     console.log("   ✅ checkout.completed: successfully created invoice");
//   } catch (error) {
//     console.error("checkout.completed: error creating invoice", error);
//   }
// }

// subscriptionId: !isOneOff
//         ? (checkoutSession.subscription as string)
//         : undefined,
