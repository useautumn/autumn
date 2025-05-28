import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addWeeks,
  format,
} from "date-fns";
import { Stripe } from "stripe";

export const getStripeNow = async ({
  stripeCli,
  stripeCus,
  stripeSub,
}: {
  stripeCli: Stripe;
  stripeCus?: Stripe.Customer;
  stripeSub?: Stripe.Subscription;
}) => {
  if (stripeSub && !stripeSub.livemode && stripeSub.test_clock) {
    try {
      const stripeClock = await stripeCli.testHelpers.testClocks.retrieve(
        stripeSub.test_clock as string,
      );
      return stripeClock.frozen_time * 1000;
    } catch (error) {}
  }

  if (stripeCus && !stripeCus.livemode && stripeCus.test_clock) {
    try {
      const stripeClock = await stripeCli.testHelpers.testClocks.retrieve(
        stripeCus.test_clock as string,
      );
      return stripeClock.frozen_time * 1000;
    } catch (error) {}
  }

  return Date.now();
};

export const advanceTestClock = async ({
  stripeCli,
  testClockId,
  startingFrom,
  numberOfDays,
  numberOfWeeks,
  numberOfHours,
  numberOfMonths,
  advanceTo,
}: {
  stripeCli: Stripe;
  testClockId: string;
  numberOfDays?: number;
  startingFrom?: Date;
  numberOfWeeks?: number;
  numberOfHours?: number;
  numberOfMonths?: number;
  advanceTo?: number;
}) => {
  if (!startingFrom) {
    startingFrom = new Date();
  }

  if (numberOfDays) {
    advanceTo = addDays(startingFrom, numberOfDays).getTime();
  }

  if (numberOfWeeks) {
    advanceTo = addWeeks(startingFrom, numberOfWeeks).getTime();
  }

  if (numberOfHours) {
    advanceTo = addHours(startingFrom, numberOfHours).getTime();
  }

  if (numberOfMonths) {
    advanceTo = addMonths(startingFrom, numberOfMonths).getTime();
  }

  if (!advanceTo) {
    advanceTo = addMinutes(addMonths(startingFrom, 1), 10).getTime();
  }

  console.log("   - Advancing to: ", format(advanceTo, "yyyy MMM dd HH:mm:ss"));
  await stripeCli.testHelpers.testClocks.advance(testClockId, {
    frozen_time: Math.floor(advanceTo / 1000),
  });

  // await timeout(
  //   waitForSeconds ? waitForSeconds * 1000 : STRIPE_TEST_CLOCK_TIMING,
  // );
};
