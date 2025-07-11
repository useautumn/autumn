import { AttachPreview, CheckoutResponseSchema } from "@autumn/shared";
import {} from "./CheckoutResponse.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";

export const previewToCheckoutRes = ({
  attachParams,
  preview,
}: {
  attachParams: AttachParams;
  preview: AttachPreview;
}) => {
  // Current line items to attach preview
  // const lines = preview.due_today.line_items.map((item) => ({
  //   ...item,
  //   total: item.total.toString(),
  //   due_date: item.due_date.toISOString(),
  // }));
  console.log("Preview", preview);

  return CheckoutResponseSchema.parse({
    customer_id: attachParams.customer.id,
    // scenario: previewToAttachScenar,
    lines: [],
  });
};
