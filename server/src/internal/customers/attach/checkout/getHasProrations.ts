import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachBranch } from "@autumn/shared";
import {
  attachParamsToCurCusProduct,
  attachParamToCusProducts,
} from "../attachUtils/convertAttachParams.js";
import { cusProductToPrices } from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";

export const getHasProrations = async ({
  req,
  branch,
  attachParams,
}: {
  req: ExtendedRequest;
  branch: AttachBranch;
  attachParams: AttachParams;
}) => {
  let hasProrations = false;

  let { curMainProduct } = attachParamToCusProducts({ attachParams });
  if (branch == AttachBranch.Upgrade) {
    let curPrices = cusProductToPrices({ cusProduct: curMainProduct! });

    if (!isFreeProduct(curPrices)) {
      return true;
    }
  }

  if (branch == AttachBranch.UpdatePrepaidQuantity) {
    return true;
  }

  return false;
};
