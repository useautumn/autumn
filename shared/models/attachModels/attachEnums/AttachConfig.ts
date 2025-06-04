import { AttachBranch } from "./AttachBranch.js";

export enum ProrationBehavior {
  Immediately = "immediately",
  NextBilling = "next_billing",
  None = "none",
}

export interface AttachConfig {
  onlyCheckout: boolean;
  carryUsage: boolean; // Whether to carry over existing usages
  branch: AttachBranch;
  proration: ProrationBehavior;
  disableTrial: boolean;
  invoiceOnly: boolean;
}
