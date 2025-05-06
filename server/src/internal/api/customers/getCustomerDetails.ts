import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCusBalances } from "@/internal/customers/entitlements/getCusBalances.js";
import {
  fullCusProductToCusEnts,
  fullCusProductToCusPrices,
} from "@/internal/customers/products/cusProductUtils.js";
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
  Organization,
  CusEntResponse,
  CusEntResponseV2,
  CusProductResponse,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { EntityService } from "../entities/EntityService.js";
import { getCusInvoices, processFullCusProducts } from "./cusUtils.js";

export const sumValues = (
  entList: CusEntResponse[],
  key: keyof CusEntResponse
) => {
  return entList.reduce((acc, curr) => {
    if (curr[key]) {
      return acc + Number(curr[key]);
    }

    return acc;
  }, 0);
};

export const getEarliestNextResetAt = (entList: CusEntResponse[]) => {
  let earliest = entList.reduce((acc, curr) => {
    if (curr.next_reset_at && curr.next_reset_at < acc) {
      return curr.next_reset_at;
    }

    return acc;
  }, Infinity);

  return earliest == Infinity ? null : earliest;
};

export const featuresToObject = ({
  features,
  entList,
}: {
  features: Feature[];
  entList: CusEntResponse[];
}) => {
  let featureObject: Record<string, CusEntResponseV2> = {};
  for (let entRes of entList) {
    let feature = features.find((f) => f.id == entRes.feature_id)!;
    if (feature.type == FeatureType.Boolean) {
      featureObject[feature.id] = {
        id: feature.id,
        name: feature.name,
      };
      continue;
    } else if (entRes.unlimited) {
      featureObject[feature.id] = {
        id: feature.id,
        name: feature.name,
        unlimited: true,
      };
      continue;
    }

    let featureId = feature.id;
    let unlimited = entRes.unlimited;
    let relatedEnts = entList.filter((e) => e.feature_id == featureId);

    if (featureObject[featureId]) {
      continue;
    }

    featureObject[featureId] = {
      id: featureId,
      name: feature.name,
      unlimited,
      balance: unlimited ? null : sumValues(relatedEnts, "balance"),
      usage: sumValues(relatedEnts, "usage"),
      included_usage: sumValues(relatedEnts, "included_usage"),

      next_reset_at: getEarliestNextResetAt(relatedEnts),
      interval: relatedEnts.length == 1 ? relatedEnts[0].interval : "multiple",
      breakdown:
        relatedEnts.length > 1
          ? relatedEnts.map((e) => ({
              interval: e.interval!,
              balance: e.balance,
              usage: e.usage,
              included_usage: e.included_usage,
              next_reset_at: e.next_reset_at,
            }))
          : undefined,
    };
  }

  return featureObject;
};

export const getCustomerDetails = async ({
  customer,
  sb,
  org,
  env,
  params = {},
  logger,
  cusProducts,
}: {
  customer: Customer;
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  params?: any;
  logger: any;
  cusProducts?: FullCusProduct[];
}) => {
  // 1. Get full customer products & processed invoices
  const [fullCusProducts, processedInvoices, entities] = await Promise.all([
    (async () => {
      if (cusProducts) {
        return cusProducts;
      }

      return await CusService.getFullCusProducts({
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
      });
    })(),
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
  ]);

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

  let apiVersion = org.api_version || APIVersion.v1;

  if (apiVersion >= APIVersion.v1_1) {
    let entList: any = balances.map((b) => {
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
    });

    let products: any = [...main, ...addOns];

    if (apiVersion >= APIVersion.v1_2) {
      entList = featuresToObject({
        features,
        entList,
      });
      let productObject: Record<string, CusProductResponse> = {};
      for (let product of products) {
        productObject[product.id] = product as any;
      }
      products = productObject;
    }

    let cusResponse = {
      ...CusResponseSchema.parse({
        ...customer,
        stripe_id: customer.processor?.id,
        products,
        features: entList,
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
