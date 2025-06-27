import { CusProductStatus, FullCusProduct, SuccessCode } from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { getOrgAndFeatures } from "@/internal/orgs/orgUtils.js";

import { getProductCheckPreview } from "./getProductCheckPreview.js";

export const handleProductCheck = async ({
  req,
  res,
}: {
  req: any;
  res: any;
}) => {
  const {
    customer_id,
    product_id,
    entity_id,
    customer_data,
    with_preview,
    entity_data,
  } = req.body;
  const { orgId, env, logtail: logger, db } = req;

  let { org, features } = await getOrgAndFeatures({ req });

  // 1. Get customer and org
  let [customer, product] = await Promise.all([
    getOrCreateCustomer({
      req,
      customerId: customer_id,
      customerData: customer_data,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],

      entityId: entity_id,
      entityData: entity_data,
      withEntities: true,
    }),
    ProductService.getFull({
      db,
      orgId,
      env,
      idOrInternalId: product_id,
    }),
  ]);

  let cusProducts = customer.customer_products;
  if (customer.entity) {
    cusProducts = cusProducts.filter(
      (cusProduct: FullCusProduct) =>
        cusProduct.internal_entity_id == customer.entity!.internal_id,
    );
  }

  let cusProduct: FullCusProduct | undefined = cusProducts.find(
    (cusProduct: FullCusProduct) => cusProduct.product.id === product_id,
  );

  let preview = with_preview
    ? await getProductCheckPreview({
        req,
        customer,
        product,
        logger,
      })
    : undefined;

  // let preview = with_preview
  //   ? await getAttachPreview({
  //       db,
  //       customer,
  //       org,
  //       env,
  //       product: product!,
  //       cusProducts,
  //       features,
  //       logger,
  //       shouldFormat: with_preview == "formatted",
  //     })
  //   : undefined;

  if (!cusProduct) {
    res.status(200).json({
      customer_id,
      code: SuccessCode.ProductFound,
      product_id,
      allowed: false,

      preview,
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

    preview,
  });

  return;
};
