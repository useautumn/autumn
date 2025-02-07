import { Request, Response } from "express";
import { verifySvixSignature } from "./webhookUtils.js";
import { createSupabaseClient } from "../supabaseUtils.js";
import { Webhook } from "svix";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClerkCli } from "../clerkUtils.js";
import { sendOnboardingEmail } from "./sendOnboardingEmail.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";
import { AppEnv } from "@autumn/shared";

const verifyClerkWebhook = async (req: Request, res: Response) => {
  const wh = new Webhook(process.env.CLERK_SIGNING_SECRET!);

  const headers = req.headers;
  const payload = req.body;

  const svix_id = headers["svix-id"];
  const svix_timestamp = headers["svix-timestamp"];
  const svix_signature = headers["svix-signature"];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    res.status(400).json({
      success: false,
      message: "Error: Missing svix headers",
    });
    return;
  }

  let evt: any;
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id as string,
      "svix-timestamp": svix_timestamp as string,
      "svix-signature": svix_signature as string,
    });
  } catch (err) {
    console.log("Error: Could not verify webhook");
    res.status(400).json({
      success: false,
      message: "Error: Could not verify webhook",
    });
    return;
  }

  return evt;
};

export const handleClerkWebhook = async (req: any, res: any) => {
  let event = await verifyClerkWebhook(req, res);
  if (!event) {
    return;
  }

  const eventType = event.type;
  const eventData = event.data;

  try {
    switch (eventType) {
      case "organization.created":
        await handleOrgCreated(req.sb, eventData);
        break;

      case "organization.deleted":
        await OrgService.delete({
          sb: req.sb,
          orgId: eventData.id,
        });

      default:
        break;
    }
  } catch (error) {
    handleRequestError({
      req,
      error,
      res,
      action: "Handle Clerk Webhook",
    });
  }

  return void res.status(200).json({
    success: true,
    message: "Webhook received",
  });
};

const handleOrgCreated = async (sb: SupabaseClient, eventData: any) => {
  await OrgService.insert({
    sb,
    org: {
      id: eventData.id,
      slug: eventData.slug,
      default_currency: "usd",
      stripe_connected: false,
      stripe_config: null,
      test_pkey: generatePublishableKey(AppEnv.Sandbox),
      live_pkey: generatePublishableKey(AppEnv.Live),
    },
  });

  await sendOnboardingEmail({
    orgId: eventData.id,
    clerkCli: createClerkCli(),
  });
};
