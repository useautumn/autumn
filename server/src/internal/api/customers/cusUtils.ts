import { Customer, ProcessorType } from "@autumn/shared";

import { CreateCustomer } from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";
import { AppEnv } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { createStripeCustomer } from "@/external/stripe/stripeCusUtils.js";

import { generateId } from "@/utils/genUtils.js";
import Stripe from "stripe";

export const createNewCustomer = async ({
  sb,
  orgId,
  env,
  customer,
  nextResetAt,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customer: CreateCustomer;
  nextResetAt?: number;
}) => {
  const org = await OrgService.getFullOrg({
    sb,
    orgId,
  });

  const customerData: Customer = {
    ...customer,
    internal_id: generateId("cus"),
    org_id: orgId,
    created_at: Date.now(),
    env,
  };

  let stripeCustomer: Stripe.Customer | undefined;
  if (org.stripe_connected) {
    stripeCustomer = await createStripeCustomer({
      org,
      env,
      customer: customerData,
    });
    customerData.processor = {
      type: ProcessorType.Stripe,
      id: stripeCustomer?.id,
    };
  }

  const newCustomer = await CusService.createCustomer({
    sb,
    customer: customerData,
  });

  // Attach default product to customer
  const defaultProds = await ProductService.getFullDefaultProduct({
    sb,
    orgId,
    env,
  });

  for (const product of defaultProds) {
    await createFullCusProduct({
      sb,
      attachParams: {
        org,
        customer: newCustomer,
        product,
        prices: product.prices,
        entitlements: product.entitlements,
        freeTrial: null, // TODO: Free trial not supported on default product yet
        optionsList: [],
      },
      nextResetAt,
    });
  }

  return newCustomer;
};
