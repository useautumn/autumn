import { notNullish } from "@/utils/genUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import {
  CusProductStatus,
  FullCusProduct,
  FullProduct,
  SuccessCode,
} from "@autumn/shared";
import { ProductService } from "@/internal/products/ProductService.js";
import { getAttachPreview } from "./getAttachPreview.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

export const handleProductCheck = async ({
  req,
  res,
}: {
  req: any;
  res: any;
}) => {
  const { customer_id, product_id, customer_data, with_preview } = req.body;
  const { orgId, sb, env, logtail: logger } = req;

  // 1. Get customer and org
  let [customer, org, product, features] = await Promise.all([
    getOrCreateCustomer({
      sb,
      org: req.org,
      env,
      customerId: customer_id,
      customerData: customer_data,
      logger,
    }),
    OrgService.getFromReq(req),
    ProductService.getFullProduct({
      sb,
      orgId,
      env,
      productId: product_id,
    }),
    FeatureService.getFromReq(req),
  ]);

  // 2. Get cus products and payment method in parallel
  const [cusProducts] = await Promise.all([
    CusService.getFullCusProducts({
      sb,
      internalCustomerId: customer.internal_id,
      withProduct: true,
      withPrices: true,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],
    }),
  ]);

  cusProducts.sort((a: FullCusProduct, b: FullCusProduct) => {
    if (a.status === b.status) return 0;
    if (a.status === CusProductStatus.Expired) return 1;
    else return -1;
  });

  let cusProduct: FullCusProduct = cusProducts.find(
    (cusProduct: FullCusProduct) => cusProduct.product.id === product_id
  );

  if (!cusProduct) {
    res.status(200).json({
      customer_id,
      code: SuccessCode.ProductFound,
      product_id,
      allowed: false,

      preview: with_preview
        ? await getAttachPreview({
            customer,
            org,
            env,
            product: product!,
            cusProducts,
            features,
            sb,
            logger,
            shouldFormat: with_preview == "formatted",
          })
        : undefined,
    });
    return;
  }

  let onTrial =
    notNullish(cusProduct.trial_ends_at) &&
    cusProduct.trial_ends_at! > Date.now();

  res.status(200).json({
    customer_id,
    code: SuccessCode.ProductFound,
    product_id,
    allowed:
      cusProduct.status === CusProductStatus.Active ||
      cusProduct.status === CusProductStatus.PastDue,
    status: notNullish(cusProduct.canceled_at)
      ? "canceled"
      : onTrial
      ? "trialing"
      : cusProduct.status,

    preview: with_preview
      ? await getAttachPreview({
          customer,
          org,
          env,
          product: product!,
          cusProducts,
          features,
          sb,
          logger,
        })
      : undefined,
  });

  return;

  // // 4. Get balances
  // let balances: any = {};
  // let cusEnts = cusProduct.customer_entitlements;
  // for (let cusEnt of cusEnts) {
  //   let feature = cusEnt.entitlement.feature;
  //   let isBoolean = feature.type === FeatureType.Boolean;
  //   let { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
  //     cusEnts,
  //     internalFeatureId: feature.internal_id,
  //   });

  //   if (isBoolean) {
  //     balances[feature.id] = {
  //       feature_id: feature.id,
  //       balance: unlimited ? null : cusEnt.balance,
  //     };
  //     continue;
  //   }

  //   if (unlimited) {
  //     balances[feature.id] = {
  //       feature_id: feature.id,
  //       unlimited: true,
  //       usage_allowed: usageAllowed,
  //       balance: null,
  //     };
  //     continue;
  //   }

  //   if (!balances[feature.id]) {
  //     // Initialize
  //     balances[feature.id] = {
  //       feature_id: feature.id,
  //       balance: cusEnt.balance,
  //       usage_allowed: usageAllowed,
  //       unlimited: false,
  //     };
  //   } else {
  //     // Update
  //     balances[feature.id].balance += cusEnt.balance;
  //     balances[feature.id].usage_allowed = usageAllowed;
  //   }
  // }
};
