import { AppEnv } from "autumn-js";
import { initScript } from "../src/utils/scriptUtils/scriptUtils";
import Stripe from "stripe";

export const test = async () => {
	
  const { req, stripeCli } = await initScript({
    orgId: "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt",
    env: AppEnv.Sandbox,
  });

  const stripeCustomer = await stripeCli.customers.create({
    email: "test@test.com",
  });

  const newSubSchedule = await stripeCli.subscriptionSchedules.create({
    customer: stripeCustomer.id,
    phases: [
      {
        items: [
          {
            quantity: 1,
            price: "price_1SZ88Z5NEqfWRGSe7BOQBy3T",
          },
        ],
        proration_behavior: "always_invoice",
      },
    ],
    // billing_behavior: "",
    start_date: "now",
    billing_mode: { type: "flexible" },
    end_behavior: "release"
  } as Stripe.SubscriptionScheduleCreateParams)

  const subSchedule = await stripeCli.subscriptionSchedules.retrieve(newSubSchedule.id);

  console.log('Sub schedule status:', subSchedule.status);

  // Get current phase
  const updatedSubSchedule = await stripeCli.subscriptionSchedules.update(newSubSchedule.id, {
    phases: [
      {
        start_date: subSchedule.current_phase?.start_date,
        items: [
          {
            price: "price_1SZ88Z5NEqfWRGSe7BOQBy3T",
            quantity: 4,
          },
        ],
        proration_behavior: "always_invoice"
      },
    ],
  });

  
  console.log('Updated sub schedule status:', updatedSubSchedule.status);


};

await test();
process.exit(0);