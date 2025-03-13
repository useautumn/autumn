export const getOriginalCouponId = (couponId: string) => {
  const index = couponId.indexOf("_roll_");
  if (index !== -1) {
    return couponId.substring(0, index);
  }
  return couponId;
};
