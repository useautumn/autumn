import { generateId } from "@/utils/genUtils.js";
import { Coupon, CreateCoupon } from "@autumn/shared";

export const initCoupon = ({
  coupon,
  orgId,
  env,
}: {
  coupon: CreateCoupon;
  orgId: string;
  env: string;
}) => {
  return {
    ...coupon,
    internal_id: generateId("coup"),
    created_at: Date.now(),
    org_id: orgId,
    env,
  };
};

export enum CouponType {
  AddInvoiceBalance = "add_invoice_balance",
  AddBillingCredits = "add_billing_credits",
  Standard = "standard",
}

export const getCouponType = (coupon: Coupon) => {
  if (!coupon) return null;
  if (coupon.apply_to_all && coupon.should_rollover) {
    return CouponType.AddInvoiceBalance;
  } else if (coupon.should_rollover) {
    return CouponType.AddBillingCredits;
  }
  return CouponType.Standard;
};
