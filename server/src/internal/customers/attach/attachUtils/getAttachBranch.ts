import { ExtendedRequest } from "@/utils/models/Request.js";

import { AttachBody } from "../models/AttachBody.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { notNullish } from "@/utils/genUtils.js";
import { AttachBranch } from "../models/AttachBranch.js";
import { getExistingCusProducts } from "../../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  isFreeProduct,
  isProductUpgrade,
} from "@/internal/products/productUtils.js";
import {
  cusProductToPrices,
  cusProductToProduct,
} from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { FeatureOptions, FullCusProduct } from "@autumn/shared";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import { productsAreSame } from "@/internal/products/compareProductUtils.js";
import { StatusCodes } from "http-status-codes";
import { isTrialing } from "../../cusProducts/cusProductUtils.js";

const checkMultiProductErrors = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  let { products } = attachParams;

  if (pricesOnlyOneOff(attachParams.prices)) {
    return true;
  }

  for (const product of products) {
    let { curMainProduct, curSameProduct, curScheduledProduct } =
      getExistingCusProducts({
        product,
        cusProducts: attachParams.cusProducts!,
      });

    // 1. If product is add on, allow attach
    if (product.is_add_on) {
      continue;
    }

    // 1. If same product exists, not allowed
    if (curSameProduct) {
      throw new RecaseError({
        message: `Product ${product.name} is already attached, can't attach again`,
        code: ErrCode.InvalidRequest,
      });
    }

    let curPaidProduct =
      curMainProduct &&
      !isFreeProduct(cusProductToPrices({ cusProduct: curMainProduct }));

    // 2. If existing paid product, not allowed
    if (curPaidProduct) {
      throw new RecaseError({
        message: `Upgrade / downgrade to ${product.name} not allowed with multiple products`,
        code: ErrCode.InvalidRequest,
      });
    }

    if (curScheduledProduct) {
      throw new RecaseError({
        message: `Can't attach multiple products at once when scheduled product exists`,
        code: ErrCode.InvalidRequest,
      });
    }
  }
};

const getOptionsToUpdate = ({
  oldOptionsList,
  newOptionsList,
}: {
  oldOptionsList: FeatureOptions[];
  newOptionsList: FeatureOptions[];
}) => {
  let optionsToUpdate: { new: FeatureOptions; old: FeatureOptions }[] = [];

  for (const newOptions of newOptionsList) {
    let internalFeatureId = newOptions.internal_feature_id;
    let existingOptions = oldOptionsList.find(
      (o) => o.internal_feature_id === internalFeatureId,
    );

    if (existingOptions && existingOptions.quantity !== newOptions.quantity) {
      optionsToUpdate.push({
        new: newOptions,
        old: existingOptions,
      });
    }
  }

  return optionsToUpdate;
};

const checkSameCustom = async ({
  attachParams,
  curSameProduct,
}: {
  attachParams: AttachParams;
  curSameProduct: FullCusProduct;
}) => {
  let product = attachParams.products[0];

  let { itemsSame, freeTrialsSame, onlyEntsChanged } = productsAreSame({
    v1Product1: {
      ...product,
      prices: attachParams.prices,
      entitlements: attachParams.entitlements,
      free_trial: attachParams.freeTrial,
    },
    v1Product2: cusProductToProduct({ cusProduct: curSameProduct }),

    features: attachParams.features,
  });

  if (itemsSame && freeTrialsSame) {
    throw new RecaseError({
      message: `Items specified for ${product.name} are the same as the existing product, can't attach again`,
      code: ErrCode.InvalidRequest,
    });
  }

  if (onlyEntsChanged) {
    return AttachBranch.SameCustomEnts;
  }

  return AttachBranch.SameCustom;
};

const getSameProductBranch = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  let product = attachParams.products[0];

  let { curSameProduct, curScheduledProduct } = getExistingCusProducts({
    product: attachParams.products[0],
    cusProducts: attachParams.cusProducts!,
  });

  curSameProduct = curSameProduct!;

  // 1. If new version?
  if (curSameProduct.product.version !== product.version) {
    return AttachBranch.NewVersion;
  }

  // 2. Same custom?
  if (attachParams.isCustom) {
    return await checkSameCustom({ attachParams, curSameProduct });
  }

  let optionsToUpdate = getOptionsToUpdate({
    oldOptionsList: curSameProduct.options,
    newOptionsList: attachParams.optionsList,
  });

  // 1. If prepaid quantity changed
  if (optionsToUpdate.length > 0) {
    attachParams.optionsToUpdate = optionsToUpdate;
    if (attachParams.isCustom) {
      throw new RecaseError({
        message: `Not allowed to update prepaid quantity for current product if is_custom is true`,
        code: ErrCode.InternalError,
        statusCode: 500,
      });
    }

    return AttachBranch.UpdatePrepaidQuantity;
  }

  // 2. If add on product
  if (product.is_add_on) {
    return AttachBranch.AddOn;
  }

  // 3. If main product
  if (curScheduledProduct) {
    if (curScheduledProduct.product.id == product.id) {
      throw new RecaseError({
        message: `Product ${product.name} is already scheduled, can't attach again`,
        code: ErrCode.InvalidRequest,
      });
    }

    return AttachBranch.Renew;
  }

  if (curSameProduct.canceled_at) {
    return AttachBranch.Renew;
  }

  // Invalid, can't attach same product
  throw new RecaseError({
    message: `Product ${product.name} is already attached, can't attach again`,
    code: ErrCode.InvalidRequest,
  });
};

const getChangeProductBranch = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { curMainProduct, curScheduledProduct } = getExistingCusProducts({
    product: attachParams.products[0],
    cusProducts: attachParams.cusProducts!,
  });

  // 1. If main product is free, it's the same as adding a new product
  let mainProduct = cusProductToProduct({ cusProduct: curMainProduct! });
  if (isFreeProduct(mainProduct.prices)) {
    return AttachBranch.MainIsFree;
  }

  if (isTrialing(curMainProduct!)) {
    return AttachBranch.MainIsTrial;
  }

  // 2. If main product is paid, check if upgrade or downgrade
  // Check if upgrade or downgrade
  let curPrices = cusProductToPrices({ cusProduct: curMainProduct! });
  let newPrices = attachParams.prices;

  let isUpgrade = isProductUpgrade({ prices1: curPrices, prices2: newPrices });
  if (isUpgrade) {
    return AttachBranch.Upgrade;
  }

  return AttachBranch.Downgrade;
};

export const getAttachBranch = async ({
  req,
  attachBody,
  attachParams,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
  attachParams: AttachParams;
}) => {
  // 1. Multi product
  if (notNullish(attachBody.product_ids)) {
    await checkMultiProductErrors({ attachParams });
    return AttachBranch.MultiProduct;
  }

  // 2. One off prices
  if (pricesOnlyOneOff(attachParams.prices)) {
    return AttachBranch.OneOff;
  }

  const { curMainProduct, curSameProduct } = getExistingCusProducts({
    product: attachParams.products[0],
    cusProducts: attachParams.cusProducts!,
  });

  // 3. Same product
  if (curSameProduct) {
    return await getSameProductBranch({ attachParams });
  }

  // 4. Main product exists
  if (curMainProduct) {
    return getChangeProductBranch({ attachParams });
  }

  // 5. New product!
  let product = attachParams.products[0];

  if (product.is_add_on) {
    return AttachBranch.AddOn;
  } else {
    return AttachBranch.New;
  }
};
