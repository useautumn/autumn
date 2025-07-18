import { routeHandler } from "@/utils/routerUtils.js";
import { getOrCreateCustomer } from "../cusUtils/getOrCreateCustomer.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";

export const handleSetupPayment = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "setup_payment",
    handler: async (req: ExtendedRequest, res: any) => {
      // 1. Get the customer
      const { db, env, org } = req;

      let { customer_id, customer_data, success_url, checkout_session_params } =
        req.body;

      let customer = await getOrCreateCustomer({
        req,
        customerId: customer_id,
        customerData: customer_data as any,
      });

      await createStripeCusIfNotExists({
        db,
        org,
        env,
        customer,
        logger: req.logger,
      });

      const stripeCli = createStripeCli({ org, env });
      const session = await stripeCli.checkout.sessions.create({
        customer: customer.processor?.id,
        mode: "setup",
        success_url: success_url || org.stripe_config?.success_url,
        currency: org.default_currency || "usd",
        payment_method_types: ["card"],
        ...(checkout_session_params as any),
      });

      return res.json({
        customer_id: customer.id,
        url: session.url,
      });
    },
  });
