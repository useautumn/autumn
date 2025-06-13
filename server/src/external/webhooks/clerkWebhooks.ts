import { Request, Response } from "express";
import { Webhook } from "svix";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClerkCli } from "../clerkUtils.js";
import { sendOnboardingEmail } from "./sendOnboardingEmail.js";
import { AppEnv } from "autumn-js";

import { deleteSvixApp } from "../svix/svixUtils.js";
import {
  deleteStripeWebhook,
  initOrgSvixApps,
} from "@/internal/orgs/orgUtils.js";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { constructOrg } from "@/internal/orgs/orgUtils.js";
import { createOnboardingProducts } from "@/internal/orgs/onboarding/createOnboardingProducts.js";
import { eq } from "drizzle-orm";
import { Organization, organizations } from "@autumn/shared";

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
        await saveOrgToDB({
          db: req.db,
          id: eventData.id,
          slug: eventData.slug,
        });
        break;

      case "organization.deleted":
        await handleOrgDeleted({
          db: req.db,
          eventData,
        });
        break;

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
    return;
  }

  return void res.status(200).json({
    success: true,
    message: "Webhook received",
  });
};

export const saveOrgToDB = async ({
  db,
  id,
  slug,
}: {
  db: DrizzleCli;
  id: string;
  slug: string;
}) => {
  console.log(`Handling organization.created: ${slug} (${id})`);

  try {
    // // 2. Insert org
    // await OrgService.insert({
    //   db,
    //   org: constructOrg({
    //     id,
    //     slug,
    //   }),
    // });

    // 1. Create svix webhoooks
    const { sandboxApp, liveApp } = await initOrgSvixApps({
      slug,
      id,
    });

    await OrgService.update({
      db,
      orgId: id,
      updates: {
        svix_config: { sandbox_app_id: sandboxApp.id, live_app_id: liveApp.id },
      },
    });

    console.log(`Created svix webhooks for org ${id}`);
  } catch (error: any) {
    if (error?.data && error.data.code == "23505") {
      console.error(
        `Org ${id} already exists in Supabase -- skipping creationg`,
      );
      return;
    }
    console.error(
      `Failed to insert org. Code: ${error.code}, message: ${error.message}`,
    );
    return;
  }

  // try {
  //   await sendOnboardingEmail({
  //     orgId: id,
  //     clerkCli: createClerkCli(),
  //   }),
  // } catch (error) {
  //   console.error(
  //     "Failed to create default products or send onboarding email",
  //     error,
  //   );
  // }
};

const handleOrgDeleted = async ({
  db,
  eventData,
}: {
  db: DrizzleCli;
  eventData: any;
}) => {
  // 1. Delete svix webhooks

  try {
    console.log(`Handling organization.deleted: (${eventData.id})`);

    const org = (await db.query.organizations.findFirst({
      where: eq(organizations.id, eventData.id),
    })) as unknown as Organization;

    if (!org) {
      throw new RecaseError({
        message: `Clerk webhook, tried deleting org ${eventData.slug} but not found`,
        code: "org_not_found",
        statusCode: 404,
      });
    }

    console.log("1. Deleting svix webhooks");
    const batch = [];
    if (org.svix_config?.sandbox_app_id) {
      batch.push(
        deleteSvixApp({
          appId: org.svix_config.sandbox_app_id,
        }),
      );
    }

    if (org.svix_config?.live_app_id) {
      batch.push(
        deleteSvixApp({
          appId: org.svix_config.live_app_id,
        }),
      );
    }

    await Promise.all(batch);

    // 2. Delete stripe webhooks
    console.log("2. Deleting stripe webhooks");
    if (org.stripe_config) {
      await deleteStripeWebhook({
        org: org,
        env: AppEnv.Sandbox,
      });

      await deleteStripeWebhook({
        org: org,
        env: AppEnv.Live,
      });
    }

    // 3. Delete org
    console.log("3. Deleting org");
    await OrgService.delete({
      db,
      orgId: eventData.id,
    });

    console.log(`Deleted org ${org.slug} (${org.id})`);
  } catch (error) {
    console.log("Failed to delete organization", error);
    return;
  }
};
