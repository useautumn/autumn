import { notNullish } from "@/utils/genUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import {
  CusProductStatus,
  Entity,
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
  const { customer_id, product_id, entity_id, customer_data, with_preview } =
    req.body;
  const { orgId, sb, env, logtail: logger } = req;

  // 1. Get customer and org
  let [customer, org, product, features] = await Promise.all([
    getOrCreateCustomer({
      sb,
      org: req.org,
      env,
      customerId: customer_id,
      customerData: customer_data,
      entityId: entity_id,
      logger,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],
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

  let cusProducts = customer.customer_products;
  if (customer.entity) {
    cusProducts = cusProducts.filter(
      (cusProduct: FullCusProduct) =>
        cusProduct.internal_entity_id == customer.entity.internal_id
    );
  }

  let cusProduct: FullCusProduct | undefined = cusProducts.find(
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
    entity_id,
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
};
