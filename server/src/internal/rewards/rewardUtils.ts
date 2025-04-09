import { generateId } from "@/utils/genUtils.js";
import { Reward, CreateReward } from "@autumn/shared";

export const initCoupon = ({
  coupon,
  orgId,
  env,
  id,
}: {
  coupon: CreateReward;
  orgId: string;
  env: string;
  id?: string;
}) => {
  let promoCodes = coupon.promo_codes.filter((promoCode) => {
    return promoCode.code.length > 0;
  });
  return {
    ...coupon,
    internal_id: id || generateId("coup"),
    created_at: Date.now(),
    org_id: orgId,
    env,
    promo_codes: promoCodes,
  };
};

export enum CouponType {
  AddInvoiceBalance = "add_invoice_balance",
  AddBillingCredits = "add_billing_credits",
  Standard = "standard",
}

export const getCouponType = (coupon: Reward) => {
  if (!coupon) return null;
  if (coupon.apply_to_all && coupon.should_rollover) {
    return CouponType.AddInvoiceBalance;
  } else if (coupon.should_rollover) {
    return CouponType.AddBillingCredits;
  }
  return CouponType.Standard;
};

export const getOriginalCouponId = (couponId: string) => {
  if (!couponId) return null;
  const index = couponId.indexOf("_roll_");
  if (index !== -1) {
    return couponId.substring(0, index);
  }
  return couponId;
};
