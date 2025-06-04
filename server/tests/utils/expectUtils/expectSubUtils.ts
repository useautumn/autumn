import { DrizzleCli } from "@/db/initDrizzle.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { AppEnv, FullCusProduct, Organization } from "@autumn/shared";
import { expect } from "chai";
import { getDate } from "date-fns";

import Stripe from "stripe";

export const expectSubAnchorsSame = async ({
  stripeCli,
  customerId,
  productId,
  db,
  org,
  env,
}: {
  stripeCli: Stripe;
  customerId: string;
  productId: string;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
}) => {
  const fullCus = await CusService.getFull({
    db,
    idOrInternalId: customerId,
    orgId: org.id,
    env,
  });

  const cusProduct = fullCus.customer_products.find(
    (cp: FullCusProduct) => cp.product.id == productId,
  );

  const subs: Stripe.Subscription[] = await getStripeSubs({
    stripeCli,
    subIds: cusProduct?.subscription_ids,
  });

  let periodEnd = subs[0].current_period_end * 1000;
  let firstDate = getDate(periodEnd);

  for (const sub of subs.slice(1)) {
    let dateOfAnchor = getDate(sub.current_period_end * 1000);
    expect(dateOfAnchor).to.equal(
      firstDate,
      `subscription anchors are the same`,
    );
  }
};
