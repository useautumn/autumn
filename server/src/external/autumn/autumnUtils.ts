import { AppEnv, Organization } from "@autumn/shared";
import { Autumn } from "./autumnCli.js";

export const sendFeatureEvent = async ({
  org,
  env,
  incrementBy,
}: {
  org: Organization;
  env: AppEnv;
  incrementBy: number;
}) => {
  // if (env !== AppEnv.Live) {
  //   return;
  // }

  try {
    const autumn = new Autumn();

    await autumn.sendEvent({
      customerId: org.id,
      eventName: "feature",
      properties: {
        value: incrementBy,
      },
      customer_data: {
        name: org.slug,
      },
    });
  } catch (error: any) {
    console.log("Failed to send feature event", error?.message || error);
  }
};

export const sendProductEvent = async ({
  org,
  env,
  incrementBy,
}: {
  org: Organization;
  env: AppEnv;
  incrementBy: number;
}) => {
  // if (env !== AppEnv.Live) {
  //   return;
  // }

  try {
    const autumn = new Autumn();

    await autumn.sendEvent({
      customerId: org.id,
      eventName: "product",
      properties: {
        value: incrementBy,
      },
      customer_data: {
        name: org.slug,
      },
    });
  } catch (error: any) {
    console.log("Failed to send product event", error?.message || error);
  }
};
