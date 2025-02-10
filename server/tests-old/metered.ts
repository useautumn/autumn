import dotenv from "dotenv";
dotenv.config();
import { AppEnv } from "@autumn/shared";
import axios from "axios";
import { initCustomer } from "./utils.js";

const apiKey = "am_test_3Zbu1qcRkR6mhq5gtgqScvVN";
const apiUrl = "http://localhost:8080/v1";
const orgId = "org_2s4vfEyYVgFZDlOwcMHjsHR0eef";
const env = AppEnv.Sandbox;

const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const sendEvent = async () => {
  try {
    const { data } = await axios.post(
      `${apiUrl}/events`,
      {
        customer_id: "123",
        event_name: "sonnet_message",
        properties: {
          value: 1,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );
    console.log(data);
  } catch (error: any) {
    console.error(error.response.data);
  }
};
const main = async () => {
  await initCustomer({
    customerName: "Test 11",
    customerId: "123",
    productId: "starter",
    orgId,
    env,
    apiKey,
    apiUrl,
  });
  console.log("Customer initialized");
  await timeout(3000);

  const batchEvents = [];
  for (let i = 0; i < 50; i++) {
    batchEvents.push(sendEvent());
  }

  // await Promise.all(batchEvents);
  // console.log("Done sending events");

  // // View meter usage
  // const sb = createSupabaseClient();
  // const customer = await CusService.getById({
  //   sb,
  //   id: "123",
  //   orgId,
  //   env,
  // });

  // const org = await OrgService.getFullOrg({
  //   sb,
  //   orgId,
  // });

  // const stripeCli = createStripeCli({ org, env });
  // const meterSummary = await stripeCli.billing.meters.listEventSummaries(
  //   "mtr_test_61RzIB9NJlpZILzUB41GHoZUApXXdRCK",
  //   {
  //     customer: customer.processor.id,
  //     end_time: Math.floor(Date.now() / 1000),
  //     start_time: Math.floor(Date.now() / 1000) - 1000 * 60 * 60 * 24,
  //   }
  // );
  // console.log(meterSummary);
  // const stripeCus = await stripeCli.customers.retrieve(
  //   customer.processor.id
  // );
};

main();
