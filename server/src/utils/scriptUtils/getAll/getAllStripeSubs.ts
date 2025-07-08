import { timeout } from "@/utils/genUtils.js";
import { Stripe } from "stripe";

export const getAllStripeSubscriptions = async ({
  numPages,
  limit = 100,
  stripeCli,
  waitForSeconds,
}: {
  numPages?: number;
  limit?: number;
  stripeCli: Stripe;
  waitForSeconds?: number;
}) => {
  let hasMore = true;
  let startingAfter: string | null = null;
  const allSubscriptions: any[] = [];

  let pageCount = 0;
  while (hasMore) {
    const response: any = await stripeCli.subscriptions.list({
      limit,
      starting_after: startingAfter || undefined,
      expand: ["data.discounts"],
    });

    allSubscriptions.push(...response.data);

    hasMore = response.has_more;
    startingAfter = response.data[response.data.length - 1].id;

    pageCount++;
    if (numPages && pageCount >= numPages) {
      break;
    }

    console.log("Fetched", allSubscriptions.length, "subscriptions");
    if (waitForSeconds) {
      await timeout(1000);
    }
  }

  return {
    subscriptions: allSubscriptions,
    total: allSubscriptions.length,
  };
};
