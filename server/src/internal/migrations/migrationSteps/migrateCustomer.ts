import { EntityService } from "@/internal/api/entities/EntityService.js";
import {
  handleUpgrade,
  ProrationBehavior,
} from "@/internal/customers/change-product/handleUpgrade.js";
import { CusService } from "@/internal/customers/CusService.js";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  MigrationJob,
  Customer,
  Organization,
  AppEnv,
  FullProduct,
  CusProductStatus,
  FullCusProduct,
  Price,
  BillingType,
  UsagePriceConfig,
  Feature,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { MigrationService } from "../MigrationService.js";
import { constructMigrationError } from "../migrationUtils.js";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import { FeatureOptions } from "@autumn/shared";
export const migrateCustomer = async ({
  migrationJob,
  sb,
  customer,
  org,
  logger,
  env,
  orgId,
  fromProduct,
  toProduct,
  features,
}: {
  migrationJob: MigrationJob;
  sb: SupabaseClient;
  customer: Customer;
  org: Organization;
  env: AppEnv;
  orgId: string;
  fromProduct: FullProduct;
  toProduct: FullProduct;
  logger: any;
  features: Feature[];
}) => {
  try {
    // await new Promise((resolve) => setTimeout(resolve, 5000));
    let cusProducts = await CusService.getFullCusProducts({
      sb,
      internalCustomerId: customer.internal_id,
      withProduct: true,
      withPrices: true,
      inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
    });

    let entities = await EntityService.get({
      sb,
      orgId,
      env,
      internalCustomerId: customer.internal_id,
    });

    let curCusProduct = await cusProducts.find(
      (cp: FullCusProduct) => cp.product.internal_id == fromProduct.internal_id
    );

    let attachParams: AttachParams = {
      org,
      customer,
      products: [toProduct],
      prices: toProduct.prices,
      entitlements: toProduct.entitlements,
      freeTrial: toProduct.free_trial || null,
      features,
      optionsList: curCusProduct.options,
      entities,
      cusProducts,
    };

    // Get prepaid prices
    let prepaidPrices = toProduct.prices.filter(
      (price: Price) =>
        getBillingType(price.config!) === BillingType.UsageInAdvance
    );

    for (const prepaidPrice of prepaidPrices) {
      let config = prepaidPrice.config as UsagePriceConfig;

      let newPrepaid = curCusProduct.options.find(
        (option: FeatureOptions) =>
          option.internal_feature_id === config.internal_feature_id
      );

      if (!newPrepaid) {
        curCusProduct.options.push({
          feature_id: config.feature_id,
          internal_feature_id: config.internal_feature_id,
          quantity: 0,
        });
      }
    }

    await handleUpgrade({
      req: {
        sb,
        orgId,
        env,
        logtail: logger,
      },
      res: null,
      attachParams,
      curCusProduct,
      curFullProduct: fromProduct,
      fromReq: false,
      carryExistingUsages: true,
      prorationBehavior: ProrationBehavior.None,
      newVersion: true,
    });

    return true;
  } catch (error: any) {
    logger.error(
      `Migration failed for customer ${customer.id}, job id: ${migrationJob.id}`
    );
    logger.error(error);
    if (error instanceof RecaseError) {
      logger.error(`Recase error: ${error.message} (${error.code})`);
    } else if (error.type === "StripeError") {
      logger.error(`Stripe error: ${error.message} (${error.code})`);
    } else {
      logger.error("Unknown error:", error);
    }

    await MigrationService.insertError({
      sb,
      data: constructMigrationError({
        migrationJobId: migrationJob.id,
        internalCustomerId: customer.internal_id,
        data: error.data || error,
        code: error.code || "unknown",
        message: error.message || "unknown",
      }),
    });

    return false;
  }
};
