import { DrizzleCli } from "@/db/initDrizzle.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { generateId } from "@/utils/genUtils.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { BillingInterval } from "@autumn/shared";

export const createSubSchedule = async ({
  db,
  attachParams,
  itemSet,
  endOfBillingPeriod,
}: {
  db: DrizzleCli;
  attachParams: AttachParams;
  itemSet: {
    subItems: any[];
    invoiceItems: any[];
    usageFeatures: string[];
  };
  endOfBillingPeriod: number;
}) => {
  const { org, customer, paymentMethod } = attachParams;

  const { stripeCli } = attachParams;

  // let subItems = items.filter(
  //   (item: any, index: number) =>
  //     index >= prices.length ||
  //     prices[index].config!.interval !== BillingInterval.OneOff
  // );
  // let oneOffItems = items.filter(
  //   (item: any, index: number) =>
  //     index < prices.length &&
  //     prices[index].config!.interval === BillingInterval.OneOff
  // );
  const { subItems, invoiceItems, usageFeatures } = itemSet;

  const newSubscriptionSchedule = await stripeCli.subscriptionSchedules.create({
    customer: customer.processor.id,
    start_date: endOfBillingPeriod,
    billing_mode: { type: "flexible" },
    phases: [
      {
        items: subItems,
        default_payment_method: paymentMethod?.id,
        add_invoice_items: invoiceItems,
      },
    ],
  });

  await SubService.createSub({
    db,
    sub: {
      id: generateId("sub"),
      stripe_id: null,
      stripe_schedule_id: newSubscriptionSchedule.id,
      created_at: Date.now(),
      usage_features: usageFeatures,
      org_id: org.id,
      env: customer.env,
      current_period_start: null,
      current_period_end: null,
    },
  });

  return newSubscriptionSchedule;
};
