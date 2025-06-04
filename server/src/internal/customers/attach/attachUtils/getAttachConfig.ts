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

  let config: AttachConfig = {
    branch,
    onlyCheckout:
      (isPublic || forceCheckout || noPaymentMethod) && !invoiceOnly && !isFree,
    carryUsage: branch === AttachBranch.SameCustom, // If same custom (and new version?), carry over existing usages...
    proration: org.config.bill_upgrade_immediately
      ? ProrationBehavior.Immediately
      : ProrationBehavior.NextBilling,
    disableTrial:
      branch === AttachBranch.NewVersion ||
      branch == AttachBranch.Downgrade ||
      attachBody.free_trial === false,
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
