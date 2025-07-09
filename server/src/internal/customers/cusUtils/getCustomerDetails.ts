import Stripe from "stripe";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { BREAK_API_VERSION } from "@/utils/constants.js";
import {
  AppEnv,
  CusProductStatus,
  FullCusProduct,
  APIVersion,
  CusResponseSchema,
  CustomerResponseSchema,
  CusEntResponseSchema,
  FeatureType,
  Feature,
  Organization,
  FullCustomer,
  CusExpand,
  RewardResponse,
  EntityResponseSchema,
} from "@autumn/shared";
import { getCusInvoices } from "./cusUtils.js";

import { orgToVersion } from "@/utils/versionUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import {
  cusProductsToCusEnts,
  cusProductsToCusPrices,
} from "../cusProducts/cusProductUtils/convertCusProduct.js";
import { invoicesToResponse } from "@/internal/invoices/invoiceUtils.js";
import { getCusBalances } from "./cusFeatureResponseUtils/getCusBalances.js";
import { featuresToObject } from "./cusFeatureResponseUtils/balancesToFeatureResponse.js";
import { processFullCusProducts } from "./cusProductResponseUtils/processFullCusProducts.js";
import { getCusReferrals } from "./cusResponseUtils/getCusReferrals.js";
import { getCusRewards } from "./cusResponseUtils/getCusRewards.js";
import { getCusPaymentMethodRes } from "./cusResponseUtils/getCusPaymentMethodRes.js";

export const getCustomerDetails = async ({
  db,
  customer,
  features,
  org,
  env,
  params = {},
  logger,
  cusProducts,
  expand,
  reqApiVersion,
}: {
  db: DrizzleCli;
  customer: FullCustomer;
  features: Feature[];
  org: Organization;
  env: AppEnv;
  params?: any;
  logger: any;
  cusProducts: FullCusProduct[];
  expand: CusExpand[];
  reqApiVersion?: number;
}) => {
  let apiVersion = orgToVersion({
    org,
    reqApiVersion,
  });

  let withRewards = expand.includes(CusExpand.Rewards);

  let subs;
  let inStatuses = org.config.include_past_due
    ? [CusProductStatus.Active, CusProductStatus.PastDue]
    : [CusProductStatus.Active];

  let cusEnts = cusProductsToCusEnts({ cusProducts, inStatuses }) as any;

  const balances = await getCusBalances({
    cusEntsWithCusProduct: cusEnts,
    cusPrices: cusProductsToCusPrices({ cusProducts, inStatuses }),
    org,
    apiVersion,
  });

  let subIds = cusProducts.flatMap(
    (cp: FullCusProduct) => cp.subscription_ids || [],
  );

  if (org.config.api_version >= BREAK_API_VERSION && org.stripe_connected) {
    let stripeCli = createStripeCli({
      org,
      env,
    });

    subs = await getStripeSubs({
      stripeCli,
      subIds,
      expand: withRewards ? ["discounts"] : undefined,
    });
  }

  const { main, addOns } = await processFullCusProducts({
    fullCusProducts: cusProducts,
    subs,
    org,
    apiVersion,
    entities: customer.entities,
    features,
  });

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
    }

    let withInvoices = expand.includes(CusExpand.Invoices);

    let rewards: RewardResponse | undefined = await getCusRewards({
      org,
      env,
      fullCus: customer,
      subs,
      subIds,
      expand,
    });

    let referrals = await getCusReferrals({
      db,
      fullCus: customer,
      expand,
    });

    let paymentMethod = await getCusPaymentMethodRes({
      org,
      env,
      fullCus: customer,
      expand,
    });

    let cusResponse = {
      ...CusResponseSchema.parse({
        ...customer,
        stripe_id: customer.processor?.id,
        features: entList,
        products,
        // invoices: withInvoices ? invoices : undefined,
        invoices: withInvoices
          ? invoicesToResponse({
              invoices: customer.invoices || [],
              logger,
            })
          : undefined,
        trials_used: expand.includes(CusExpand.TrialsUsed)
          ? customer.trials_used
          : undefined,
        rewards: withRewards ? rewards : undefined,
        metadata: customer.metadata,
        entities: expand.includes(CusExpand.Entities)
          ? customer.entities.map((e) =>
              EntityResponseSchema.parse({
                id: e.id,
                name: e.name,
                customer_id: customer.id,
                feature_id: e.feature_id,
                created_at: e.created_at,
                env: customer.env,
              }),
            )
          : undefined,
        referrals,
        payment_method: paymentMethod,
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
    let withItems = org.config.api_version >= BREAK_API_VERSION;

    const processedInvoices = await getCusInvoices({
      db,
      internalCustomerId: customer.internal_id,
      limit: 20,
      withItems,
      features,
    });

    return {
      customer: CustomerResponseSchema.parse(customer),
      products: main,
      add_ons: addOns,
      entitlements: balances,
      invoices: processedInvoices,
      trials_used: expand.includes(CusExpand.TrialsUsed)
        ? customer.trials_used
        : undefined,
    };
  }
};
