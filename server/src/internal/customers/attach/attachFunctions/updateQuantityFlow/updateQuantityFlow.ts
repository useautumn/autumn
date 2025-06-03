import { SuccessCode } from "@autumn/shared";
import {
  AttachParams,
  AttachResultSchema,
} from "../../../cusProducts/AttachParams.js";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";
import { updateFeatureQuantity } from "./updateFeatureQuantity.js";
import { AttachConfig } from "@autumn/shared";

export const handleUpdateQuantityFunction = async ({
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
  // 2. Update quantities
  const optionsToUpdate = attachParams.optionsToUpdate!;

  const { customer } = attachParams;
  const { curSameProduct } = attachParamToCusProducts({ attachParams });

  await updateFeatureQuantity({
    db: req.db,
    stripeCli: attachParams.stripeCli,
    cusProduct: curSameProduct!,
    optionsToUpdate: optionsToUpdate!,
    config,
    logger: req.logtail,
  });

  res.status(200).json(
    AttachResultSchema.parse({
      customer_id: customer.id || customer.internal_id,
      product_ids: attachParams.products.map((p) => p.id),
      code: SuccessCode.FeaturesUpdated,
      message: `Successfully updated quantity for features: ${optionsToUpdate.map((o) => o.new.feature_id).join(", ")}`,
    }),
  );
};
