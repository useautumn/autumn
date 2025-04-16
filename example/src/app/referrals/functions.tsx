"use server";

import { Autumn } from "@/sdk/autumn";

export const getReferralCode = async (customerId: string) => {
  console.log("Getting referral code");
  const autumn = new Autumn();
  const referralCode = await autumn.referrals.createCode({
    customerId,
    referralId: "referral",
  });
  return referralCode;
};

export const redeemReferralCode = async ({
  customerId,
  referralCode,
}: {
  customerId: string;
  referralCode: string;
}) => {
  const autumn = new Autumn();
  const redemption = await autumn.referrals.redeem({
    customerId,
    code: referralCode,
  });
  console.log("Referral code redeemed");
  console.log("Redemption", redemption);
  return redemption;
};
