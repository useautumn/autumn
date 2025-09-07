import express, { Router } from "express";
import {
  handleGetOrgMembers,
  handleRemoveMember,
} from "./handlers/handleGetOrgMembers.js";

import { OrgService } from "./OrgService.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { createOrgResponse } from "./orgUtils.js";
import { handleGetUploadUrl } from "./handlers/handleGetUploadUrl.js";
import { handleDeleteOrg } from "./handlers/handleDeleteOrg.js";
import { handleGetInvites } from "./handlers/handleGetInvites.js";
import { handleConnectStripe } from "./handlers/handleConnectStripe.js";
import { handleDeleteStripe } from "./handlers/handleDeleteStripe.js";
import { handleGetOrg } from "./handlers/handleGetOrg.js";

export const orgRouter: Router = express.Router();
orgRouter.get("/members", handleGetOrgMembers);
orgRouter.post("/remove-member", handleRemoveMember);
orgRouter.get("/upload_url", handleGetUploadUrl);
orgRouter.get("/invites", handleGetInvites as any);
orgRouter.delete("", handleDeleteOrg as any);

orgRouter.delete("/delete-user", async (req: any, res) => {
  res.status(200).json({
    message: "User deleted",
  });
});

orgRouter.get("", handleGetOrg);

orgRouter.post("/stripe", handleConnectStripe);

orgRouter.delete("/stripe", handleDeleteStripe);

// async (req: any, res) => {
//   try {
//     let { testApiKey, liveApiKey, successUrl, defaultCurrency } = req.body;
//     let { db, orgId, logtail: logger } = req;
//     if (!testApiKey || !liveApiKey || !successUrl) {
//       throw new RecaseError({
//         message: "Missing required fields",
//         code: ErrCode.StripeKeyInvalid,
//         statusCode: 400,
//       });
//     }

//     // 1. Check if API keys are valid
//     try {
//       await clearOrgCache({
//         db,
//         orgId,
//         logger,
//       });

//       console.log("Connecting Stripe");
//       await checkKeyValid(testApiKey);
//       await checkKeyValid(liveApiKey);

//       // Get default currency from Stripe
//       let stripe = new Stripe(testApiKey);
//       let account = await stripe.accounts.retrieve();

//       if (nullish(defaultCurrency) && nullish(account.default_currency)) {
//         throw new RecaseError({
//           message: "Default currency not set",
//           code: ErrCode.StripeKeyInvalid,
//           statusCode: 500,
//         });
//       } else if (nullish(defaultCurrency)) {
//         defaultCurrency = account.default_currency;
//       }
//     } catch (error: any) {
//       throw new RecaseError({
//         message: error.message || "Invalid Stripe API keys",
//         code: ErrCode.StripeKeyInvalid,
//         statusCode: 500,
//         data: error,
//       });
//     }

//     // 2. Create webhook endpoint
//     let testWebhook: Stripe.WebhookEndpoint;
//     let liveWebhook: Stripe.WebhookEndpoint;
//     try {
//       testWebhook = await createWebhookEndpoint(
//         testApiKey,
//         AppEnv.Sandbox,
//         req.orgId
//       );
//       liveWebhook = await createWebhookEndpoint(
//         liveApiKey,
//         AppEnv.Live,
//         req.orgId
//       );
//     } catch (error) {
//       throw new RecaseError({
//         message: "Error creating stripe webhook",
//         code: ErrCode.StripeKeyInvalid,
//         statusCode: 500,
//         data: error,
//       });
//     }

//     // 1. Update org in Supabase first
//     const updatedOrg = await OrgService.update({
//       db,
//       orgId: req.orgId,
//       updates: {
//         stripe_connected: true,
//         default_currency: defaultCurrency,
//         stripe_config: {
//           test_api_key: encryptData(testApiKey),
//           live_api_key: encryptData(liveApiKey),
//           test_webhook_secret: encryptData(testWebhook.secret as string),
//           live_webhook_secret: encryptData(liveWebhook.secret as string),
//           success_url: successUrl,
//         },
//       },
//     });

//     // 2. Ensure products are created in Stripe (after org is updated)
//     await ensureStripeProducts({
//       db,
//       logger,
//       req,
//       org: updatedOrg as Organization,
//     });

//     res.status(200).json({
//       message: "Stripe connected",
//     });
//   } catch (error: any) {
//     handleRequestError({
//       req,
//       error,
//       res,
//       action: "connect stripe",
//     });
//   }
// }
