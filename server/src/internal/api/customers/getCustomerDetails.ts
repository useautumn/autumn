import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCusBalances } from "@/internal/customers/entitlements/getCusBalances.js";
import {
  fullCusProductToCusEnts,
  fullCusProductToCusPrices,
} from "@/internal/customers/products/cusProductUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { BREAK_API_VERSION } from "@/utils/constants.js";
import {
  Customer,
  AppEnv,
  CusProductStatus,
  FullCusProduct,
  APIVersion,
  CusResponseSchema,
  CustomerResponseSchema,
  FullCustomerEntitlement,
  CusEntResponseSchema,
  FeatureType,
  Feature,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { EntityService } from "../entities/EntityService.js";
import { getCusInvoices, processFullCusProducts } from "./cusUtils.js";

export const getCustomerDetails = async ({
  customer,
  sb,
  orgId,
  env,
  params = {},
  logger,
}: {
  customer: Customer;
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  params?: any;
  logger: any;
}) => {
  // 1. Get full customer products & processed invoices
  const [fullCusProducts, processedInvoices, entities, org] = await Promise.all(
    [
      CusService.getFullCusProducts({
        sb,
        internalCustomerId: customer.internal_id,
        withProduct: true,
        withPrices: true,
        inStatuses: [
          CusProductStatus.Active,
          CusProductStatus.PastDue,
          CusProductStatus.Scheduled,
        ],
        logger,
      }),
      getCusInvoices({
        sb,
        internalCustomerId: customer.internal_id,
        limit: 20,
      }),
      EntityService.getByInternalCustomerId({
        sb,
        internalCustomerId: customer.internal_id,
        logger,
      }),
      OrgService.getFullOrg({
        sb,
        orgId,
      }),
    ]
  );

  let subs;
  let subIds = fullCusProducts.flatMap(
    (cp: FullCusProduct) => cp.subscription_ids
  );

  if (org.config.api_version >= BREAK_API_VERSION && org.stripe_connected) {
    let stripeCli = createStripeCli({
      org,
      env,
    });

    subs = await getStripeSubs({
      stripeCli,
      subIds,
    });
  }

  // 2. Initialize group by balances
  let cusEnts = fullCusProductToCusEnts(fullCusProducts) as any;

  // 3. Get entitlements
  const balances = await getCusBalances({
    cusEntsWithCusProduct: cusEnts,
    cusPrices: fullCusProductToCusPrices(fullCusProducts),
    entities,
    org,
  });

  const { main, addOns } = processFullCusProducts({
    fullCusProducts,
    subs,
    org,
  });

  let features = cusEnts.map(
    (cusEnt: FullCustomerEntitlement) => cusEnt.entitlement.feature
  );

  if (org.api_version == APIVersion.v1_1) {
    let cusResponse = {
      ...CusResponseSchema.parse({
        ...customer,
        // autumn_id: customer.internal_id,
        stripe_id: customer.processor?.id,
        products: [...main, ...addOns],
        // add_ons: addOns,
        features: balances.map((b) => {
          let isBoolean =
            features.find((f: Feature) => f.id == b.feature_id)?.type ==
            FeatureType.Boolean;
          if (b.unlimited || isBoolean) {
            return b;
          }

          return CusEntResponseSchema.parse({
            ...b,
            usage: b.used,
            included_usage: b.allowance,
          });
        }),
      }),
    };

    if (params?.with_autumn_id === "true") {
      return {
        ...cusResponse,
        autumn_id: customer.internal_id,
      };
    } else {
      return cusResponse;
    }
  } else {
    return {
      customer: CustomerResponseSchema.parse(customer),
      products: main,
      add_ons: addOns,
      entitlements: balances,
      invoices: processedInvoices,
    };
  }
};
