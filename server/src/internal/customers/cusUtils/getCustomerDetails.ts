import Stripe from "stripe";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getCusBalances } from "@/internal/customers/cusProducts/cusEnts/cusFeatureUtils/getCusBalances.js";

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
  CusEntResponse,
  CusEntResponseV2,
  FullCustomer,
  CusExpand,
  RewardType,
  RewardResponse,
  CouponDurationType,
  EntityResponseSchema,
} from "@autumn/shared";
import { getCusInvoices, processFullCusProducts } from "./cusUtils.js";

import { orgToVersion } from "@/utils/versionUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import {
  cusProductsToCusEnts,
  cusProductsToCusPrices,
} from "../cusProducts/cusProductUtils/convertCusProduct.js";
import { invoicesToResponse } from "@/internal/invoices/invoiceUtils.js";
import { featuresToObject } from "../cusProducts/cusEnts/cusFeatureUtils/balancesToFeatureResponse.js";

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

  const { main, addOns } = processFullCusProducts({
    fullCusProducts: cusProducts,
    subs,
    org,
    apiVersion,
    entities: customer.entities,
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

    let rewards: RewardResponse | undefined;
    if (withRewards && customer.processor?.id) {
      let stripeCli = createStripeCli({
        org,
        env,
      });

      const [stripeCus, subsResult] = await Promise.all([
        stripeCli.customers.retrieve(
          customer.processor?.id!,
        ) as Promise<Stripe.Customer>,
        !subs
          ? getStripeSubs({
              stripeCli,
              subIds,
              expand: ["discounts"],
            })
          : null,
      ]);

      if (!subs && subsResult) {
        subs = subsResult;
      }

      let stripeDiscounts: Stripe.Discount[] = subs?.flatMap(
        (s) => s.discounts,
      ) as Stripe.Discount[];

      if (stripeCus.discount) {
        stripeDiscounts.push(stripeCus.discount);
      }

      rewards = {
        discounts: stripeDiscounts.map((d) => {
          let duration_type: CouponDurationType;
          let duration_value = 0;
          if (d.coupon?.duration === "forever") {
            duration_type = CouponDurationType.Forever;
          } else if (d.coupon?.duration === "once") {
            duration_type = CouponDurationType.OneOff;
          } else if (d.coupon?.duration === "repeating") {
            duration_type = CouponDurationType.Months;
            duration_value = d.coupon?.duration_in_months || 0;
          } else {
            duration_type = CouponDurationType.OneOff;
          }
          return {
            id: d.coupon?.id,
            name: d.coupon?.name ?? "",
            type: d.coupon?.amount_off
              ? RewardType.FixedDiscount
              : RewardType.PercentageDiscount,
            discount_value: d.coupon?.amount_off || d.coupon?.percent_off || 0,
            currency: d.coupon?.currency ?? null,
            start: d.start ?? null,
            end: d.end ?? null,
            subscription_id: d.subscription ?? null,
            duration_type,
            duration_value,
          };
        }),
      };
    }

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
