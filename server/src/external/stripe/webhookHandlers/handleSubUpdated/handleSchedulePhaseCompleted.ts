import { DrizzleCli } from "@/db/initDrizzle.js";
import { AppEnv, CusProductStatus, Organization } from "@autumn/shared";
import Stripe from "stripe";
import { createStripeCli } from "../../utils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

import { cusProductInPhase } from "@/internal/customers/attach/mergeUtils/phaseUtils/phaseUtils.js";
import { formatUnixToDateTime, notNullish } from "@/utils/genUtils.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";

export const handleSchedulePhaseCompleted = async ({
  db,
  subObject,
  prevAttributes,
  env,
  org,
  logger,
}: {
  db: DrizzleCli;
  subObject: Stripe.Subscription;
  prevAttributes: any;
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  const phasePossiblyChanged =
    notNullish(prevAttributes?.items) && notNullish(subObject.schedule);

  if (!phasePossiblyChanged) return;

  const stripeCli = createStripeCli({ org, env });
  const schedule = await stripeCli.subscriptionSchedules.retrieve(
    subObject.schedule as string,
    {
      expand: ["customer"],
    }
  );

  const cusProducts = await CusProductService.getByScheduleId({
    db,
    scheduleId: schedule.id,
    orgId: org.id,
    env,
  });

  const curPhase = schedule.phases[0];
  const now = await getStripeNow({
    stripeCli,
    stripeCus: schedule.customer as Stripe.Customer,
  });
  const currentPhase = schedule.phases.find(
    (phase) =>
      phase.start_date <= Math.floor(now / 1000) &&
      phase.end_date > Math.floor(now / 1000)
  );

  console.log("Now:", formatUnixToDateTime(now));
  console.log(
    "Current phase:",
    formatUnixToDateTime(currentPhase?.start_date! * 1000)
  );

  for (const cusProduct of cusProducts) {
    const isScheduled = cusProduct.status === CusProductStatus.Scheduled;
    const isInPhase = cusProductInPhase({
      phaseStart: currentPhase?.start_date,
      cusProduct,
    });

    console.log(
      "Phase start:",
      formatUnixToDateTime(currentPhase?.start_date! * 1000)
    );
    console.log(
      "Cus product starts at:",
      formatUnixToDateTime(cusProduct.starts_at)
    );
    console.log("Is in phase:", isInPhase);
    console.log("Is scheduled:", isScheduled);

    if (isScheduled && isInPhase) {
      console.log(
        "Transitioning scheduled product to active:",
        cusProduct.product.name,
        "entity ID:",
        cusProduct.entity_id
      );
    }

    console.log("--------------------------------");

    // const stripeCli = createStripeCli({ org, env });
    // const sub = await stripeCli.subscriptions.retrieve(cusProduct.stripe_sub_id);

    // console.log("SUB:", sub.id);
  }
};
