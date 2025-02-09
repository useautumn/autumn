// Initialize customer
import axios from "axios";
import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { AppEnv } from "@autumn/shared";
import { createStripeCli } from "@/external/stripe/utils.js";
import { attachPmToCus } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";

export const initCustomer = async ({
  orgId,
  env,
  apiKey,
  apiUrl,
  customerId,
  customerName,
  productId,
}: {
  orgId: string;
  env: AppEnv;
  apiKey: string;
  apiUrl: string;
  customerId: string;
  customerName: string;
  productId: string;
}) => {
  const sb = createSupabaseClient();
  const org = await OrgService.getFullOrg({
    sb,
    orgId,
  });

  // Reinitialize customer
  try {
    await axios.delete(`${apiUrl}/customers/123`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (error) {}

  const { data } = await axios.post(
    `${apiUrl}/customers`,
    {
      id: customerId,
      name: customerName,
      email: "test@gmail.com",
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  const customer = data.customer;

  const stripeCli = createStripeCli({ org, env });
  const stripeCus = await stripeCli.customers.create({
    email: data.customer.email,
    name: data.customer.name,
  });

  customer.processor = {
    id: stripeCus.id,
    type: "stripe",
  };
  await CusService.update({
    sb,
    internalCusId: data.customer.internal_id,
    update: {
      processor: { id: stripeCus.id, type: "stripe" },
    },
  });

  await attachPmToCus(stripeCli, data.customer.processor.id);

  if (productId) {
    const { data: res } = await axios.post(
      `${apiUrl}/attach`,
      {
        customer_id: data.customer.id,
        product_id: productId,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );
    console.log("res: ", res);
  }
};
