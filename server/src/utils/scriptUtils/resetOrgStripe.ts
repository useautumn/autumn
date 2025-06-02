import { AppEnv } from "@shared/models/genModels/genEnums.js";

import { Organization } from "@autumn/shared";
import {
  deactivateStripeMeters,
  deleteAllStripeProducts,
} from "@/external/stripe/stripeProductUtils.js";
import { deleteAllStripeCustomers } from "@/external/stripe/stripeCusUtils.js";

export const resetOrgStripe = async ({ org }: { org: Organization }) => {
  const env = AppEnv.Sandbox;

  await deleteAllStripeCustomers({
    org,
    env,
  });

  await deleteAllStripeProducts({
    org,
    env,
  });

  await deactivateStripeMeters({
    org,
    env,
  });
};
