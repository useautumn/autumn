import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { AttachBranch } from "@autumn/shared";

export const handleCheckoutErrors = ({
  attachParams,
  branch,
}: {
  attachParams: AttachParams;
  branch: AttachBranch;
}) => {
  if (attachParams.setupPayment) {
    // Make sure only usage prices are added?
  }
};
