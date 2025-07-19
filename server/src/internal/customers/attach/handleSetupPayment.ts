import { routeHandler } from "@/utils/routerUtils.js";
import { getOrCreateCustomer } from "../cusUtils/getOrCreateCustomer.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";

export const handleSetupPayment = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "setup_payment",
    handler: async (req: ExtendedRequest, res: any) => {
      const { db, env, org } = req;
      const logger = req.logger;

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

      // check if user already specified payment methods in their request
      const hasUserSpecifiedPaymentMethods = 
        checkout_session_params && checkout_session_params.payment_method_types;

      const sessionParams = {
        customer: customer.processor?.id,
        mode: "setup",
        success_url: success_url || org.stripe_config?.success_url,
        currency: org.default_currency || "usd",
        ...(checkout_session_params as any),
      };

      try {
        // let stripe automatically determine payment methods
        const session = await stripeCli.checkout.sessions.create(sessionParams);
        return res.json({
          customer_id: customer.id,
          url: session.url,
        });
      } catch (error: any) {
        // payment method errors
        if (error.message && 
            (error.message.includes("payment method") || 
             error.message.includes("No valid payment"))) {
          
          logger.warn("Stripe checkout session creation failed", {
            customerId: customer.id,
            error: error.message,
          });

          if (hasUserSpecifiedPaymentMethods) {
            throw error;
          }

          try {
            // card payment method fallback
            const fallbackSession = await stripeCli.checkout.sessions.create({
              ...sessionParams,
              payment_method_types: ["card"],
            });

            logger.info("Created checkout session with card payment method", {
              customerId: customer.id,
            });

            return res.json({
              customer_id: customer.id,
              url: fallbackSession.url,
            });
          } catch (fallbackError: any) {
            // if fallback failed
            logger.error("Failed to create checkout session even with card payment method", {
              customerId: customer.id,
              error: fallbackError.message,
            });
            
            throw new RecaseError({
              code: ErrCode.InvalidRequest,
              message: "Unable to create checkout session. Please ensure you have activated card payment method in your Stripe dashboard.",
              statusCode: 400,
            });
          }
        }
        
        // Re-throw errors
        throw error;
      }
    },
  });
