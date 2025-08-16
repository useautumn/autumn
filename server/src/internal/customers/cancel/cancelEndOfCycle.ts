import { createStripeCli } from "@/external/stripe/utils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { CusProductStatus, FullCusProduct, FullCustomer } from "@autumn/shared";
import { cusProductToSub } from "../cusProducts/cusProductUtils/convertCusProduct.js";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { CusProductService } from "../cusProducts/CusProductService.js";

export const cancelEndOfCycle = async ({
  req,
  cusProduct,
  fullCus,
}: {
  req: ExtendedRequest;
  cusProduct: FullCusProduct;
  fullCus: FullCustomer;
}) => {
  const { db, org, env, logger } = req;
  const stripeCli = createStripeCli({ org, env });

  const sub = await cusProductToSub({ cusProduct, stripeCli });
  if (sub) {
    const latestPeriodEnd = getLatestPeriodEnd({ sub });
    await stripeCli.subscriptions.update(sub.id, {
      cancel_at: latestPeriodEnd,
    });

    await CusProductService.update({
      db,
      cusProductId: cusProduct.id,
      updates: { canceled_at: Date.now() },
    });
  } else {
    await CusProductService.update({
      db,
      cusProductId: cusProduct.id,
      updates: {
        status: CusProductStatus.Expired,
        ended_at: Date.now(),
      },
    });
  }
};
