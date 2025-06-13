import { deleteSvixApp } from "@/external/svix/svixUtils.js";
import RecaseError, { handleFrontendReqError } from "@/utils/errorUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AppEnv, customers, ErrCode, Organization } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { Request, Response } from "express";
import { deleteStripeWebhook } from "../orgUtils.js";
import { OrgService } from "../OrgService.js";
import { auth } from "@/utils/auth.js";

const deleteSvixWebhooks = async ({
  org,
  logger,
}: {
  org: Organization;
  logger: any;
}) => {
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

  try {
    await Promise.all(batch);
  } catch (error) {
    logger.error(`Failed to delete svix webhooks for ${org.id}, ${org.slug}`);
  }
};

const deleteStripeWebhooks = async ({
  org,
  logger,
}: {
  org: Organization;
  logger: any;
}) => {
  if (org.stripe_config) {
    try {
      await deleteStripeWebhook({
        org: org,
        env: AppEnv.Sandbox,
      });

      await deleteStripeWebhook({
        org: org,
        env: AppEnv.Live,
      });
    } catch (error: any) {
      logger.error(
        `Failed to delete stripe webhooks for ${org.id}, ${org.slug}. ${error.message})`,
      );
    }
  }
};

export const handleDeleteOrg = async (req: ExtendedRequest, res: Response) => {
  try {
    const { org, db, logtail: logger } = req;

    // 1. Check if any customers
    let hasCustomers = await db.query.customers.findFirst({
      where: eq(customers.org_id, org.id),
    });

    if (hasCustomers)
      throw new RecaseError({
        message: "Cannot delete org with production mode customers",
        code: ErrCode.OrgHasCustomers,
        statusCode: 400,
      });

    // 2. Delete svix webhooks
    logger.info("1. Deleting svix webhooks");
    await deleteSvixWebhooks({ org, logger });

    // 3. Delete stripe webhooks
    logger.info("2. Deleting stripe webhooks");
    await deleteStripeWebhooks({ org, logger });

    // 4. Delete all sandbox customers
    logger.info("3. Deleting sandbox customers");
    await db
      .delete(customers)
      .where(
        and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Sandbox)),
      );

    res.status(200).json({
      message: "Org deleted",
    });
  } catch (error) {
    handleFrontendReqError({
      res,
      error,
      req,
      action: "delete-org",
    });
  }
};
