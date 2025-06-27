import { checkToAttachParams } from "@/internal/customers/attach/attachUtils/attachParams/checkToAttachParams.js";
import { FullCustomer, FullProduct } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachBody } from "@/internal/customers/attach/models/AttachBody.js";
import { attachParamsToPreview } from "@/internal/customers/attach/handleAttachPreview/attachParamsToPreview.js";

import {
  AttachFunction,
  AttachPreview,
  CheckProductPreview,
  Feature,
  Organization,
} from "@autumn/shared";

import { getAttachScenario } from "./attachToCheckPreview/getAttachScenario.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import { formatAmount } from "@/utils/formatUtils.js";
import { Decimal } from "decimal.js";
import { notNullish } from "@/utils/genUtils.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

const getNextCycle = (preview: AttachPreview) => {
  if (!preview.due_next_cycle && !preview.due_today) {
    return undefined;
  }

  if (!preview.due_today && preview.due_next_cycle) {
  }
};
export const attachToCheckPreview = async ({
  preview,
  params,
  product,
  org,
  features,
  db,
  fullCus,
}: {
  preview: AttachPreview;
  params: AttachParams;
  product: FullProduct;
  org: Organization;
  features: Feature[];
  db: DrizzleCli;
  fullCus: FullCustomer;
}) => {
  // 1. If check
  let attachFunc = preview.func;

  const noOptions = !preview.options || preview.options.length === 0;
  if (attachFunc == AttachFunction.CreateCheckout && noOptions) {
    return null;
  }

  let scenario = await getAttachScenario({
    preview,
    product,
  });

  let items = preview.due_today?.line_items?.map((item) => {
    return {
      price: notNullish(item.amount)
        ? formatAmount({
            amount: item.amount!,
            org,
            minFractionDigits: 2,
            maxFractionDigits: 2,
          })
        : item.price,
      description: item.description,
      usage_model: item.usage_model,
    };
  });

  let options = preview.options?.map((option: any) => {
    return {
      ...option,
      price: new Decimal(option.price).toDecimalPlaces(2).toNumber(),
    };
  });

  let due_today = preview.due_today
    ? {
        price: preview.due_today.total,
        currency: org.default_currency || "usd",
      }
    : undefined;

  let due_next_cycle = undefined;
  if (preview.due_next_cycle) {
    due_next_cycle = {
      price: preview.due_next_cycle.line_items.reduce((acc, item) => {
        if (item.amount) {
          return acc + item.amount;
        }
        return acc;
      }, 0),
      currency: org.default_currency || "usd",
    };
  }

  let checkPreview: CheckProductPreview = {
    // title: "Check",
    // message: "Check",
    scenario,

    // Meta
    product_id: product.id,
    product_name: product.name,
    recurring: !isOneOff(product.prices),
    error_on_attach: false,
    next_cycle_at: preview.due_next_cycle?.due_at,
    current_product_name: preview.current_product?.name,

    // Otehrs
    options: options?.length > 0 ? options : undefined,
    items: items?.length > 0 ? items : undefined,
    due_today,
    due_next_cycle,
    product: await getProductResponse({
      product,
      features,
      db,
      fullCus,
      currency: org.default_currency || undefined,
    }),
  };
  return checkPreview;
};

export const getProductCheckPreview = async ({
  req,
  customer,
  product,
  logger,
}: {
  req: ExtendedRequest;
  customer: FullCustomer;
  product: FullProduct;
  logger: any;
}) => {
  const { org, features, db } = req;

  // Build attach params
  const attachParams = await checkToAttachParams({
    req,
    customer,
    product,
    logger,
  });

  const attachBody: AttachBody = {
    customer_id: customer.id!,
    product_id: product.id,
    entity_id: customer.entity?.id,
  };

  const preview = await attachParamsToPreview({
    req,
    attachParams,
    attachBody,
    logger,
  });

  const checkPreview = await attachToCheckPreview({
    preview,
    params: attachParams,
    product,
    org,
    features,
    db,
    fullCus: customer,
  });

  return checkPreview;
};
