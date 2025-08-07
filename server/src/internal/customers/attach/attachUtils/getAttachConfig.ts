import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachFlags } from "../models/AttachFlags.js";
import { AttachConfig, AttachBranch, intervalsSame } from "@autumn/shared";
import { AttachBody } from "@autumn/shared";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { ProrationBehavior } from "@autumn/shared";
import { attachParamsToProduct } from "./convertAttachParams.js";
import { attachParamToCusProducts } from "./convertAttachParams.js";
import { cusProductToPrices } from "../../cusProducts/cusProductUtils/convertCusProduct.js";

export const intervalsAreSame = ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  let { curMainProduct, curSameProduct } = attachParamToCusProducts({
    attachParams,
  });

  let curCusProduct = curMainProduct || curSameProduct;

  if (!curCusProduct) {
    return false;
  }

  let newProduct = attachParamsToProduct({ attachParams });
  let curPrices = cusProductToPrices({ cusProduct: curCusProduct! });

  for (const price of curPrices) {
    let hasSimilarInterval = newProduct.prices.some((p) => {
      return intervalsSame({
        intervalA: price.config,
        intervalB: p.config,
      });
    });

    if (!hasSimilarInterval) {
      return false;
    }
  }

  for (const price of newProduct.prices) {
    let hasSimilarInterval = curPrices.some((p) => {
      return intervalsSame({
        intervalA: price.config,
        intervalB: p.config,
      });
    });

    if (!hasSimilarInterval) {
      return false;
    }
  }

  return true;
  // let curIntervals = new Set(
  //   curPrices.map((p) => ({
  //     interval: p.config.interval,
  //     intervalCount: p.config.interval_count,
  //   }))
  // );
  // let newIntervals = new Set(
  //   newProduct.prices.map((p) => ({
  //     interval: p.config.interval,
  //     intervalCount: p.config.interval_count,
  //   }))
  // );
  // return (
  //   curIntervals.size === newIntervals.size &&
  //   [...curIntervals].every((interval) => newIntervals.has(interval))
  // );
};

export const getAttachConfig = async ({
  req,
  attachParams,
  attachBody,
  branch,
}: {
  req: any;
  attachParams: AttachParams;
  attachBody: AttachBody;
  branch: AttachBranch;
}) => {
  const { org, prices, paymentMethod } = attachParams;

  let flags: AttachFlags = {
    isPublic: req.isPublic,
    forceCheckout: attachBody.force_checkout || false,
    invoiceOnly: attachBody.invoice_only || false,
    isFree: isFreeProduct(prices),
    noPaymentMethod: nullish(paymentMethod) ? true : false,
  };

  const { isPublic, forceCheckout, invoiceOnly, isFree, noPaymentMethod } =
    flags;

  let proration =
    branch == AttachBranch.SameCustomEnts || branch == AttachBranch.NewVersion
      ? ProrationBehavior.None
      : org.config.bill_upgrade_immediately
        ? ProrationBehavior.Immediately
        : ProrationBehavior.NextBilling;

  let carryUsage =
    branch == AttachBranch.SameCustomEnts ||
    branch == AttachBranch.SameCustom ||
    branch == AttachBranch.NewVersion;

  let disableTrial =
    branch === AttachBranch.NewVersion ||
    branch == AttachBranch.Downgrade ||
    attachBody.free_trial === false;

  let carryTrial = branch === AttachBranch.NewVersion;

  let sameIntervals = intervalsAreSame({ attachParams });

  let disableMerge =
    branch == AttachBranch.MainIsTrial ||
    org.config.merge_billing_cycles === false;

  const checkoutFlow =
    isPublic || forceCheckout || (noPaymentMethod && !invoiceOnly);

  const onlyCheckout = !isFree && checkoutFlow;

  let config: AttachConfig = {
    branch,
    onlyCheckout,
    carryUsage,
    proration,
    disableTrial,
    invoiceOnly: flags.invoiceOnly,
    disableMerge,
    sameIntervals,
    carryTrial,
  };

  return { flags, config };
};

export const getDefaultAttachConfig = () => {
  const config: AttachConfig = {
    branch: AttachBranch.New,
    carryUsage: false,
    onlyCheckout: false,
    proration: ProrationBehavior.None,
    disableTrial: false,
    invoiceOnly: false,
    disableMerge: false,
    sameIntervals: false,
    carryTrial: false,
  };

  return config;
};
