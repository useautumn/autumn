import { AttachPreview } from "@autumn/shared";
import { Decimal } from "decimal.js";

// 1. Calculate total
export const getAttachTotal = ({
  preview,
  options,
}: {
  preview: AttachPreview;
  options?: any;
}) => {
  const dueToday = preview?.due_today;
  let total = new Decimal(dueToday?.total || 0);

  for (const option of options || []) {
    let previewOption = preview?.options.find(
      (o: any) =>
        o.feature_id === option.feature_id || o.feature_id === option.featureId,
    );

    if (!previewOption) {
      continue;
    }

    const prepaidAmt = new Decimal(previewOption.price)
      .times(option.quantity)
      .dividedBy(previewOption.billing_units);

    total = total.plus(prepaidAmt);
  }

  return total.toDecimalPlaces(2).toNumber();
};
