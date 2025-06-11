import { productsAreSame } from "@/internal/products/compareProductUtils.js";
import {
  attachParamsToProduct,
  attachParamToCusProducts,
} from "../attachUtils/convertAttachParams.js";
import { cusProductToProduct } from "../../cusProducts/cusProductUtils/convertCusProduct.js";

export const getUpdateEntsPreview = async ({
  req,
  attachParams,
  now,
}: {
  req: any;
  attachParams: any;
  now: number;
}) => {
  const { curMainProduct } = attachParamToCusProducts({ attachParams });
  const curProduct = cusProductToProduct({ cusProduct: curMainProduct! });
  const newProduct = attachParamsToProduct({ attachParams });
  const features = attachParams.features;

  const res = productsAreSame({
    newProductV1: newProduct,
    curProductV1: curProduct,
    features,
  });

  return {
    new_items: res.newItems,
  };
};
