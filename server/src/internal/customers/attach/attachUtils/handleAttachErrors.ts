import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { StatusCodes } from "http-status-codes";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import {
  AttachBranch,
  AttachConfig,
  AttachErrCode,
  UsagePriceConfig,
} from "@autumn/shared";
import { AttachBody } from "@autumn/shared";
import { AttachFlags } from "../models/AttachFlags.js";

import {
  getEntOptions,
  priceIsOneOffAndTiered,
} from "@/internal/products/prices/priceUtils.js";
import { getPriceEntitlement } from "@/internal/products/prices/priceUtils.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { BillingType } from "@autumn/shared";
import { notNullish, nullOrUndefined } from "@/utils/genUtils.js";
import { attachParamToCusProducts } from "./convertAttachParams.js";
import {
  cusProductsToCusEnts,
  cusProductToPrices,
} from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { findPriceForFeature } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { getResetBalance } from "../../cusProducts/cusEnts/cusEntUtils.js";
import { Decimal } from "decimal.js";

const handleNonCheckoutErrors = ({
  flags,
  action,
  config,
}: {
  flags: AttachFlags;
  config: AttachConfig;
  action: string;
}) => {
  const { isPublic, forceCheckout, noPaymentMethod } = flags;

  if (isPublic) {
    throw new RecaseError({
      message: `Not allowed to ${action} when using publishable key`,
      code: ErrCode.InvalidRequest,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  } else if (forceCheckout) {
    throw new RecaseError({
      message: `Not allowed to ${action} when using force_checkout`,
      code: ErrCode.InvalidRequest,
    });
  } else if (noPaymentMethod) {
    throw new RecaseError({
      message: `Not allowed to ${action} because customer has no payment method on file`,
      code: ErrCode.InvalidRequest,
    });
  } else if (config.invoiceCheckout) {
    throw new RecaseError({
      message: `Not allowed to ${action} when using 'invoice': true`,
      code: ErrCode.InvalidRequest,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }
};

const handlePrepaidErrors = async ({
  attachParams,
  config,
  useCheckout = false,
}: {
  attachParams: AttachParams;
  config: AttachConfig;
  useCheckout?: boolean;
}) => {
  const { prices, entitlements, optionsList } = attachParams;

  // 2. Check if options are valid
  for (const price of prices) {
    const billingType = getBillingType(price.config!);

    if (billingType === BillingType.UsageInAdvance) {
      // Get options for price
      let priceEnt = getPriceEntitlement(price, entitlements);
      let options = getEntOptions(optionsList, priceEnt);

      // 1. If not checkout, quantity should be defined

      const regularCheckout = useCheckout && !config.invoiceCheckout;

      if (!regularCheckout && nullOrUndefined(options?.quantity)) {
        throw new RecaseError({
          message: `Pass in 'quantity' for feature ${priceEnt.feature_id} in options`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }

      if (
        nullOrUndefined(options?.quantity) &&
        priceIsOneOffAndTiered(price, priceEnt)
      ) {
        throw new RecaseError({
          code: ErrCode.InvalidRequest,
          message:
            "Quantity is required for start of period price that is one off and tiered",
          statusCode: 400,
        });
      }

      // 3. Quantity cannot be negative
      if (notNullish(options?.quantity) && options?.quantity! < 0) {
        throw new RecaseError({
          message: `Quantity cannot be negative`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }

      // 4. If there's only one price, quantity must be greater than 0
      if (options?.quantity === 0 && prices.length === 1) {
        throw new RecaseError({
          message: `When there's only one price, quantity must be greater than 0`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }

      let usageLimit = priceEnt.usage_limit;
      let totalQuantity =
        options?.quantity! * (price.config as UsagePriceConfig).billing_units!;

      if (usageLimit && totalQuantity + priceEnt.allowance! > usageLimit) {
        throw new RecaseError({
          message: `Quantity + included usage exceeds usage limit of ${usageLimit} for feature ${priceEnt.feature_id}`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }
    }
  }
};

const handleUpdateQuantityErrors = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { curMainProduct, curSameProduct } = attachParamToCusProducts({
    attachParams,
  });

  if (!curSameProduct && !curMainProduct) {
    return;
  }

  const cusProduct = curSameProduct || curMainProduct!;
  const cusEnts = cusProductsToCusEnts({ cusProducts: [cusProduct] });
  const prices = cusProductToPrices({ cusProduct });

  for (const option of attachParams.optionsList) {
    const price = findPriceForFeature({
      prices,
      internalFeatureId: option.internal_feature_id!,
    });

    if (!price) continue;

    const totalQuantity =
      option.quantity! * (price?.config as UsagePriceConfig).billing_units!;

    const totalUsage = cusEnts
      .reduce((acc, curr) => {
        if (
          curr.entitlement.internal_feature_id == option.internal_feature_id
        ) {
          const allowance = getResetBalance({
            entitlement: curr.entitlement,
            options: cusProduct.options.find(
              (o) => o.internal_feature_id == option.internal_feature_id
            ),
            relatedPrice: price,
          });

          const usage = new Decimal(allowance!).minus(curr.balance!);

          return acc.plus(usage);
        }

        return acc;
      }, new Decimal(0))
      .toNumber();

    if (totalUsage > totalQuantity) {
      throw new RecaseError({
        message: `Current usage for ${option.feature_id} is ${totalUsage}, can't update to ${totalQuantity}`,
        code: AttachErrCode.InvalidOptions,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  }
};

export const handleAttachErrors = async ({
  attachParams,
  attachBody,
  branch,
  flags,
  config,
}: {
  attachParams: AttachParams;
  attachBody: AttachBody;
  branch: AttachBranch;
  flags: AttachFlags;
  config: AttachConfig;
}) => {
  const { onlyCheckout } = config;

  // Invoice no payment enabled: onlyCheckout

  if (onlyCheckout || flags.isPublic) {
    let upgradeDowngradeFlows = [
      AttachBranch.Upgrade,
      AttachBranch.Downgrade,
      AttachBranch.MainIsTrial,
    ];
    if (upgradeDowngradeFlows.includes(branch)) {
      handleNonCheckoutErrors({
        flags,
        config,
        action: "perform upgrade or downgrade",
      });
    }
    let updateProductFlows = [
      AttachBranch.NewVersion,
      AttachBranch.SameCustom,
      AttachBranch.UpdatePrepaidQuantity,
    ];
    if (updateProductFlows.includes(branch)) {
      handleNonCheckoutErrors({
        flags,
        action: "update current product",
        config,
      });
    }
  }

  // 2. If same custom ents, not allowed if is public flow...
  if (branch == AttachBranch.SameCustomEnts) {
    if (flags.isPublic) {
      throw new RecaseError({
        message:
          "Not allowed to update current product when using publishable key",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  }

  await handlePrepaidErrors({
    attachParams,
    config,
    useCheckout: onlyCheckout,
  });

  // await handleUpdateQuantityErrors({
  //   attachParams,
  // });
};
