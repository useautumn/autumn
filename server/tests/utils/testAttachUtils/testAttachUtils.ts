import { notNullish } from "@/utils/genUtils.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import {
  AttachBranch,
  AttachPreview,
  OnIncrease,
  UsageModel,
} from "@autumn/shared";
import { addHours, addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import Stripe from "stripe";
import { hoursToFinalizeInvoice } from "../constants.js";

// 1. Calculate total
export const getAttachTotal = ({
  preview,
  options,
}: {
  preview: AttachPreview;
  options?: any;
}) => {
  const dueToday = preview?.due_today;

  let dueTodayTotal =
    dueToday?.line_items.reduce((acc: any, item: any) => {
      // Skip prepaid items that are already in the options
      if (
        item.usage_model == UsageModel.Prepaid &&
        options.some((o: any) => o.feature_id == item.feature_id)
      ) {
        return acc;
      }

      if (item.amount) {
        return acc.plus(item.amount);
      }
      return acc;
    }, new Decimal(0)) || new Decimal(0);

  const isUpdatePrepaidQuantity =
    preview?.branch == AttachBranch.UpdatePrepaidQuantity;
  if (isUpdatePrepaidQuantity) {
    dueTodayTotal = new Decimal(0);
  }

  for (const option of options || []) {
    const previewOption = preview?.options.find(
      (o: any) =>
        o.feature_id === option.feature_id || o.feature_id === option.featureId
    );

    const currentQuantity = previewOption.current_quantity || 0;
    const newQuantity = option.quantity || 0;
    let difference = newQuantity - currentQuantity;
    difference = difference / previewOption.billing_units;

    const isDecrease = newQuantity < currentQuantity;
    const isIncrease = newQuantity > currentQuantity;

    if (isDecrease && previewOption.config.on_decrease == "none") {
      option.quantity = currentQuantity;
      continue;
    }

    if (
      isUpdatePrepaidQuantity &&
      isIncrease &&
      previewOption.config.on_increase == OnIncrease.ProrateNextCycle
    ) {
      continue;
    }

    const differenceAmount = new Decimal(previewOption.price).times(difference);
    dueTodayTotal = dueTodayTotal.plus(differenceAmount);

    // Prorated difference
    if (previewOption.proration_amount) {
      dueTodayTotal = dueTodayTotal.plus(
        new Decimal(previewOption.proration_amount)
      );
    }

    // let previewOption = preview?.options.find(
    //   (o: any) =>
    //     o.feature_id === option.feature_id || o.feature_id === option.featureId,
    // );

    // if (!previewOption) {
    //   continue;
    // }

    // const prepaidAmt = new Decimal(previewOption.price)
    //   .times(option.quantity)
    //   .dividedBy(previewOption.billing_units);

    // dueTodayTotal = dueTodayTotal.plus(prepaidAmt);
  }

  return dueTodayTotal.toDecimalPlaces(2).toNumber();
};

export const advanceToNextInvoice = async ({
  stripeCli,
  testClockId,
}: {
  stripeCli: Stripe;
  testClockId: string;
}) => {
  await advanceTestClock({
    stripeCli,
    testClockId,
    advanceTo: addHours(
      addMonths(new Date(), 1),
      hoursToFinalizeInvoice
    ).getTime(),
    waitForSeconds: 30,
  });
};
