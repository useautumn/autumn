import { AttachConfig, CusProductStatus } from "@autumn/shared";
import { AttachParams } from "../../cusProducts/AttachParams.js";

export const handleUnifiedAttach = async ({
  req,
  res,
  attachParams,
  config,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  config: AttachConfig;
}) => {
  // 1.
  const cusProducts = attachParams.customer.customer_products;

  const scheduledCusProducts = cusProducts.filter(
    (cp) => cp.status === CusProductStatus.Scheduled
  );

  res.status(200).json({
    success: true,
    message: "Unified attach",
  });

  return;
};
