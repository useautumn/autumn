import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachConfig, AttachFlags } from "../models/AttachFlags.js";
import { AttachBranch } from "../models/AttachBranch.js";
import { AttachBody } from "../models/AttachBody.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { ProrationBehavior } from "../../change-product/handleUpgrade.js";

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

  let config: AttachConfig = {
    branch,
    onlyCheckout:
      (isPublic || forceCheckout || noPaymentMethod) && !invoiceOnly && !isFree,
    carryUsage: branch === AttachBranch.SameCustom, // If same custom (and new version?), carry over existing usages...
    proration: org.config.bill_upgrade_immediately
      ? ProrationBehavior.Immediately
      : ProrationBehavior.NextBilling,
    disableTrial:
      branch === AttachBranch.NewVersion || attachBody.free_trial === false,
  };

  return { flags, config };
};
