import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";

import {
  AttachReplaceable,
  BillingType,
  FullCusProduct,
  FullCustomerEntitlement,
  FullEntitlement,
  getFeatureInvoiceDescription,
  InsertReplaceable,
  PreviewLineItem,
  Price,
} from "@autumn/shared";
import Stripe from "stripe";
import { attachParamsToProduct } from "../convertAttachParams.js";
import {
  getBillingType,
  getPriceEntitlement,
  getPriceForOverage,
} from "@/internal/products/prices/priceUtils.js";
import { findCusEnt } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import {
  getExistingUsageFromCusProducts,
  getRelatedCusPrice,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import { Decimal } from "decimal.js";
import { getCurContUseItems } from "@/internal/invoices/previewItemUtils/getCurContUseItems.js";
import { intervalsAreSame } from "../getAttachConfig.js";
import { newPriceToInvoiceDescription } from "@/internal/invoices/invoiceFormatUtils.js";
import { getDefaultPriceStr } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { priceToContUseItem } from "./priceToContUseItem.js";
import { shouldProrate } from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";

export const getContUseNewItems = async ({
  price,
  ent,
  attachParams,
  prevCusEnt,
}: {
  price: Price;
  ent: FullEntitlement;
  attachParams: AttachParams;
  prevCusEnt?: FullCustomerEntitlement;
}) => {
  const { org, features } = attachParams;
  const newProduct = attachParamsToProduct({ attachParams });
  const intervalsSame = intervalsAreSame({ attachParams });

  let usage = getExistingUsageFromCusProducts({
    entitlement: ent,
    cusProducts: attachParams.cusProducts,
    entities: attachParams.entities,
    carryExistingUsages: undefined,
    internalEntityId: attachParams.internalEntityId,
  });

  let description = newPriceToInvoiceDescription({
    org,
    price,
    product: newProduct,
    quantity: usage,
  });

  if (usage == 0) {
    return {
      price_id: price.id,
      price: getDefaultPriceStr({ org, price, ent, features }),
      amount: undefined,
      description,
      usage_model: priceToUsageModel(price),
    } as PreviewLineItem;
  } else {
    let overage = new Decimal(usage).sub(ent.allowance!).toNumber();

    if (
      intervalsSame &&
      prevCusEnt &&
      !shouldProrate(price.proration_config?.on_decrease)
    ) {
      let isDowngrade = ent.allowance! > prevCusEnt.entitlement.allowance!;
      let prevBalance = prevCusEnt.balance!;

      if (isDowngrade && prevBalance < 0) {
        overage = new Decimal(prevBalance).abs().toNumber();
        usage = ent.allowance! - prevBalance;
      }
    }

    let amount = getPriceForOverage(price, overage);
    let description = getFeatureInvoiceDescription({
      feature: ent.feature,
      usage: usage,
      prodName: newProduct.name,
    });

    return {
      price_id: price.id,
      price: "",
      description,
      amount,
      usage_model: priceToUsageModel(price),
    } as PreviewLineItem;
  }
};

export const getContUseInvoiceItems = async ({
  cusProduct,
  stripeSubs,
  attachParams,
  logger,
}: {
  cusProduct?: FullCusProduct;
  stripeSubs?: Stripe.Subscription[];
  attachParams: AttachParams;
  logger: any;
}) => {
  const cusPrices = cusProduct ? cusProduct.customer_prices : [];
  const cusEnts = cusProduct ? cusProduct.customer_entitlements : [];

  const product = attachParamsToProduct({ attachParams });
  const intervalsSame = intervalsAreSame({ attachParams });
  const curItems = stripeSubs
    ? await getCurContUseItems({
        stripeSubs,
        attachParams,
      })
    : [];

  let newEnts = product.entitlements;
  let oldItems: PreviewLineItem[] = [];
  let newItems: PreviewLineItem[] = [];
  let replaceables: AttachReplaceable[] = [];

  for (const price of product.prices) {
    let billingType = getBillingType(price.config);
    if (billingType !== BillingType.InArrearProrated) {
      continue;
    }

    let ent = getPriceEntitlement(price, newEnts);
    let prevCusEnt = findCusEnt({
      cusEnts,
      feature: ent.feature,
    });

    let prevCusPrice = prevCusEnt
      ? getRelatedCusPrice(prevCusEnt, cusPrices)!
      : undefined;

    if (!intervalsSame || !prevCusEnt || !stripeSubs) {
      const newItem = await getContUseNewItems({
        price,
        ent,
        attachParams,
        prevCusEnt,
      });
      const prevItem = curItems.find(
        (item) => item.price_id === prevCusPrice?.price.id,
      );

      newItems.push(newItem);

      if (prevItem) {
        oldItems.push(prevItem);
      }

      continue;
    }

    const curItem = curItems.find(
      (item) => item.price_id === prevCusPrice?.price.id,
    );

    let sub = stripeSubs!.find(
      (sub) => subToAutumnInterval(sub) === price.config.interval,
    );

    let {
      oldItem,
      newItems: newItems_,
      replaceables: replaceables_,
    } = await priceToContUseItem({
      price,
      ent,
      prevCusEnt,
      attachParams,
      sub,
      logger,
      curItem: curItem!,
    });

    if (oldItem) {
      oldItems.push(oldItem);
    }

    newItems.push(...newItems_.filter((item) => item.amount !== 0));
    replaceables.push(...replaceables_);
  }

  return {
    oldItems,
    newItems,
    replaceables,
  };
};
