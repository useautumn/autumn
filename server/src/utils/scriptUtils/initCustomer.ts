import { DrizzleCli } from "@/db/initDrizzle.js";
import { AppEnv, Customer, Organization } from "@autumn/shared";
import { createStripeCli } from "../../external/stripe/utils.js";
import { Autumn } from "autumn-js";
import { attachPmToCus } from "../../external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";

export const initCustomer = async ({
  autumn,
  customerId,
  fingerprint,
  org,
  env,
  db,
  attachPm,
}: {
  autumn: Autumn;
  customerId: string;
  fingerprint?: string;
  org: Organization;
  env: AppEnv;
  db: DrizzleCli;
  attachPm?: "success" | "fail";
}) => {
  let customerData = {
    id: customerId,
    name: customerId,
    email: `${customerId}@example.com`,
    fingerprint,
  };

  // Create and delete customer
  try {
    await autumn.customers.delete(customerId);
  } catch (error) {}

  let testClockId = null;
  try {
    await autumn.customers.create(customerData);
    let customer = (await CusService.get({
      db,
      idOrInternalId: customerId,
      orgId: org.id,
      env: env,
    })) as Customer;

    if (attachPm) {
      const stripeCli = createStripeCli({ org: org, env: env });
      const testClock = await stripeCli.testHelpers.testClocks.create({
        frozen_time: Math.floor(Date.now() / 1000),
      });

      testClockId = testClock.id;

      await attachPmToCus({
        customer,
        org: org,
        env: env,
        db: db,
        willFail: attachPm === "fail",
        testClockId: testClockId,
      });
    }

    return {
      customer,
      testClockId: testClockId,
    };
  } catch (error) {
    console.log("Failed to create customer", error);
    throw error;
  }
};
