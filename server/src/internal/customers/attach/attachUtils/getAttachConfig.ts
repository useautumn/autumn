import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachFlags } from "../models/AttachFlags.js";
import { AttachConfig, AttachBranch } from "@autumn/shared";
import { AttachBody } from "../models/AttachBody.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { ProrationBehavior } from "../../change-product/handleUpgrade.js";
import { AppEnv } from "@autumn/shared";
import { Organization } from "@autumn/shared";

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

  let config: AttachConfig = {
    branch,
    onlyCheckout:
      (isPublic || forceCheckout || noPaymentMethod) && !invoiceOnly && !isFree,
    carryUsage,
    proration,
    disableTrial,
    invoiceOnly: flags.invoiceOnly,
    disableMerge: org.config.merge_billing_cycles === false,
  };

  return { flags, config };
};

const webhookToConfig = ({ org, env }: { org: Organization; env: AppEnv }) => {
  const config: AttachConfig = {
    branch: AttachBranch.NewVersion, // not needed...
    carryUsage: false, // not needed...
    onlyCheckout: false,
    proration: ProrationBehavior.Immediately,
    disableTrial: false,
    invoiceOnly: false,
    disableMerge: false,
  };

  return config;
};
