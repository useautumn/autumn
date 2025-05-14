import { Request, Response } from "express";
import { Webhook } from "svix";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClerkCli } from "../clerkUtils.js";
import { sendOnboardingEmail } from "./sendOnboardingEmail.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";
import {
  AggregateType,
  AllowanceType,
  AppEnv,
  BillingInterval,
  EntInterval,
  EntitlementSchema,
  FeatureType,
  FeatureUsageType,
  PriceSchema,
  PriceType,
  ProductSchema,
} from "@autumn/shared";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { generateId, keyToTitle } from "@/utils/genUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/prices/PriceService.js";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import { deleteSvixApp } from "../svix/svixUtils.js";
import {
  deleteStripeWebhook,
  initOrgSvixApps,
} from "@/internal/orgs/orgUtils.js";

const defaultFeatures = [
  {
    internal_id: "",
    id: "pro_analytics",
    type: FeatureType.Boolean,
    display: {
      singular: "pro analytics",
      plural: "pro analytics",
    },
  },
  {
    internal_id: "",
    id: "chat_messages",
    type: FeatureType.Metered,
    config: {
      filters: [
        {
          value: ["chat_messages"],
          property: "",
          operator: "",
        },
      ],
      aggregate: {
        type: AggregateType.Count,
      },
      usage_type: FeatureUsageType.Single,
      display: {
        singular: "chat message",
        plural: "chat messages",
      },
    },
  },
];

const createDefaultProducts = async ({
  sb,
  orgId,
}: {
  sb: SupabaseClient;
  orgId: string;
}) => {
  const env = AppEnv.Sandbox;
  const insertedFeatures = defaultFeatures.map((f) => ({
    ...f,
    org_id: orgId,
    env,
    internal_id: generateId("fe"),
    name: keyToTitle(f.id),
    created_at: Date.now(),
  }));

  await FeatureService.insert({
    sb,
    data: insertedFeatures,
    logger: console,
  });

  const defaultProducts = [
    {
      id: "free_example",
      name: "Free (Example)",
      env: AppEnv.Sandbox,
      is_default: true,
      entitlements: [
        {
          internal_feature_id: insertedFeatures[1].internal_id,
          feature_id: insertedFeatures[1].id,
          allowance: 10,
          interval: EntInterval.Month,
          allowance_type: AllowanceType.Fixed,
        },
      ],
      prices: [],
    },
    {
      id: "pro_example",
      name: "Pro (Example)",
      env: AppEnv.Sandbox,
      is_default: false,
      entitlements: [
        {
          internal_feature_id: insertedFeatures[0].internal_id,
          feature_id: insertedFeatures[0].id,
        },
        {
          internal_feature_id: insertedFeatures[1].internal_id,
          feature_id: insertedFeatures[1].id,
          allowance_type: AllowanceType.Unlimited,
        },
      ],
      prices: [
        {
          name: "Monthly",
          config: {
            type: PriceType.Fixed,
            amount: 20.5,
            interval: BillingInterval.Month,
          },
        },
      ],
    },
  ];

  const batchInsert = [];
  for (const product of defaultProducts) {
    const insertProduct = async (product: any) => {
      let internalProductId = generateId("pr");

      await ProductService.create({
        sb,
        product: ProductSchema.parse({
          ...product,
          internal_id: internalProductId,
          org_id: orgId,
          env,
          is_add_on: false,
          group: "",
          created_at: Date.now(),
          version: 1,
        }),
      });

      for (const entitlement of product.entitlements) {
        await EntitlementService.insert({
          sb,
          data: EntitlementSchema.parse({
            ...entitlement,
            id: generateId("en"),
            internal_product_id: internalProductId,
            created_at: Date.now(),
            org_id: orgId,
          }),
        });
      }

      for (const price of product.prices) {
        await PriceService.insert({
          sb,
          data: PriceSchema.parse({
            ...price,
            id: generateId("pr"),
            internal_product_id: internalProductId,
            created_at: Date.now(),
            org_id: orgId,
            billing_type: getBillingType(price.config),
          }),
        });
      }
    };

    batchInsert.push(insertProduct(product));
  }

  await Promise.all(batchInsert);
};

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
        await handleOrgDeleted(req.sb, eventData);
        break;
      // await OrgService.delete({
      //   sb: req.sb,
      //   orgId: eventData.id,
      // });
      // console.log(`Deleted org ${eventData.id}`);

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

export const handleOrgCreated = async (
  sb: SupabaseClient,
  eventData: {
    id: string;
    slug: string;
    created_at: number;
  }
) => {
  console.log(
    `Handling organization.created: ${eventData.slug} (${eventData.id})`
  );

  try {
    // 2. Insert org
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
        created_at: eventData.created_at,
        svix_config: {
          sandbox_app_id: "",
          live_app_id: "",
        },
        config: {} as any,
      },
    });

    console.log(`Inserted org ${eventData.id}`);

    // 1. Create svix webhoooks
    const { sandboxApp, liveApp } = await initOrgSvixApps({
      slug: eventData.slug,
      id: eventData.id,
    });

    await OrgService.update({
      sb,
      orgId: eventData.id,
      updates: {
        svix_config: { sandbox_app_id: sandboxApp.id, live_app_id: liveApp.id },
      },
    });

    console.log(`Created svix webhooks for org ${eventData.id}`);
  } catch (error: any) {
    if (error?.data && error.data.code == "23505") {
      console.error(
        `Org ${eventData.id} already exists in Supabase -- skipping creationg`
      );
      return;
    }
    console.error("Failed to insert org", error);
    return;
  }

  const batch = [];

  try {
    batch.push(
      createDefaultProducts({
        sb,
        orgId: eventData.id,
      })
    );

    batch.push(
      sendOnboardingEmail({
        orgId: eventData.id,
        clerkCli: createClerkCli(),
      })
    );

    await Promise.all(batch);
  } catch (error) {
    console.error(
      "Failed to create default products or send onboarding email",
      error
    );
  }
};

const handleOrgDeleted = async (sb: SupabaseClient, eventData: any) => {
  console.log(`Handling organization.deleted: (${eventData.id})`);

  const org = await OrgService.getFullOrg({
    sb,
    orgId: eventData.id,
  });

  // 1. Delete svix webhooks

  try {
    console.log("1. Deleting svix webhooks");
    const batch = [];
    if (org.svix_config.sandbox_app_id) {
      batch.push(
        deleteSvixApp({
          appId: org.svix_config.sandbox_app_id,
        })
      );
    }
    if (org.svix_config.live_app_id) {
      batch.push(
        deleteSvixApp({
          appId: org.svix_config.live_app_id,
        })
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
      sb,
      orgId: eventData.id,
    });

    console.log(`Deleted org ${org.slug} (${org.id})`);
  } catch (error) {
    console.log("Failed to delete organization", error);
    return;
  }
};
