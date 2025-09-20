import { config } from "dotenv";
config();

import {
  getAllEntities,
  getAllFullCustomers,
} from "@/utils/scriptUtils/getAll/getAllAutumnCustomers.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import {
  AppEnv,
  CusProductStatus,
  FullCusProduct,
  FullCustomer,
  Organization,
  Entity,
} from "@autumn/shared";
import Stripe from "stripe";
import assert from "assert";
import { cusProductToPrices } from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";
import {
  getAllStripeSchedules,
  getAllStripeSubscriptions,
} from "@/utils/scriptUtils/getAll/getAllStripeSubs.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getStripeSchedules } from "@/external/stripe/stripeSubUtils.js";
import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import { getRelatedCusPrice } from "./internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { checkCusSubCorrect } from "./utils/checkUtils/checkCustomerCorrect.js";
import { EntityService } from "./internal/api/entities/EntityService.js";

const { db } = initDrizzle({ maxConnections: 5 });

export const check = async () => {
  const env = AppEnv.Live;
  const orgId = "99XYziU2vChNNpdeEpvse09b8UF6BPME";

  let fullCustomers = await getAllFullCustomers({
    db,
    orgId,
    env,
  });

  const checkCustomers = ["9bafd636-0c52-46b3-8ecd-1708d6faa373"];

  fullCustomers = fullCustomers.filter((customer) =>
    checkCustomers.includes(customer.id || "")
  );

  for (const customer of fullCustomers) {
    console.log(`Checking ${customer.name} (${customer.id})`);
    const cusProducts = customer.customer_products;
    const cusEnts = cusProducts.flatMap((cp) => cp.customer_entitlements);
  }
};

check()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
