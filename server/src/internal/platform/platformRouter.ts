import { generateId } from "better-auth";
import { NextFunction, Router } from "express";

import {
  AppEnv,
  member,
  Organization,
  organizations,
  StripeConfig,
  user as userTable,
} from "@autumn/shared";

import { ExtendedRequest } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { slugify } from "@/utils/genUtils.js";
import { and, eq } from "drizzle-orm";
import { connectStripe } from "../orgs/handlers/handleConnectStripe.js";
import { z } from "zod";
import { createKey } from "../dev/api-keys/apiKeyUtils.js";
import { afterOrgCreated } from "@/utils/authUtils/afterOrgCreated.js";
import { Autumn } from "autumn-js";

const platformRouter = Router();

const platformAuthMiddleware = async (
  req: any,
  res: any,
  next: NextFunction
) => {
  if (!process.env.AUTUMN_SECRET_KEY) next();

  try {
    let autumn = new Autumn();
    const { data, error } = await autumn.check({
      customer_id: req.org.id,
      feature_id: "platform",
    });

    if (error) {
      throw error;
    }

    if (!data?.allowed) {
      res.status(403).json({
        message:
          "You're not allowed to access the platform API. Please contact hey@useautumn.com to request access!",
        code: "not_allowed",
      });
      return;
    }
    next();
  } catch (error) {
    res.status(500).json({
      message: "Failed to check if org is allowed to access platform",
      code: "internal_error",
    });
  }
};

platformRouter.use(platformAuthMiddleware);

const ExchangeSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  stripe_test_key: z.string().nonempty().optional(),
  stripe_live_key: z.string().nonempty().optional(),
});

platformRouter.post("/exchange", (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "exchange",
    handler: async (req: ExtendedRequest, res: any) => {
      let { organization, email, stripe_test_key, stripe_live_key } = req.body;

      const { db, logger } = req;

      ExchangeSchema.parse({
        organization,
        email,
        stripe_test_key,
        stripe_live_key,
      });

      // 1. Check if user with this email already exists
      let user = await db.query.user.findFirst({
        where: eq(userTable.email, email),
      });

      if (!user) {
        [user] = await db
          .insert(userTable)
          .values({
            id: generateId(),
            name: "",
            email,
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            role: "user",
            banned: false,
            banReason: null,
            banExpires: null,
            createdBy: req.org.id,
          })
          .returning();
      }

      logger.info(`User found / created: ${user.id} (${email})`);

      let org: Organization;

      let membership = await db.query.member.findFirst({
        where: and(eq(member.userId, user.id!), eq(member.role, "owner")),
      });

      if (!membership) {
        logger.info(`Connected to Stripe`);

        // 2. Create org
        let orgId = generateId();

        [org] = (await db
          .insert(organizations)
          .values({
            id: orgId,
            slug: `platform_org_${Math.floor(10000000 + Math.random() * 90000000)}`,
            name: `Platform Org`,
            logo: "",
            createdAt: new Date(),
            metadata: "",
          })
          .returning()) as [Organization];

        await db.insert(member).values({
          id: generateId(),
          organizationId: orgId,
          userId: user.id!,
          role: "owner",
          createdAt: new Date(),
        });

        await afterOrgCreated({ org });
      } else {
        org = (await db.query.organizations.findFirst({
          where: eq(organizations.id, membership.organizationId),
        })) as Organization;
      }

      let sandboxKey, prodKey;

      let finalStripeConfig: any = {};
      let defaultCurrency = org.default_currency || "usd";

      if (stripe_test_key) {
        let { test_api_key, test_webhook_secret, stripeCurrency } =
          await connectStripe({
            db,
            orgId: org.id,
            logger: req.logtail,
            apiKey: stripe_test_key,
            env: AppEnv.Sandbox,
          });
        sandboxKey = await createKey({
          db,
          orgId: org.id,
          env: AppEnv.Sandbox,
          name: "Platform API Key",
          prefix: "am_sk_test",
          meta: {},
        });
        finalStripeConfig = {
          ...finalStripeConfig,
          test_api_key,
          test_webhook_secret,
        };

        if (!defaultCurrency) {
          defaultCurrency = stripeCurrency || "usd";
        }
      }

      if (stripe_live_key) {
        let { live_api_key, live_webhook_secret, stripeCurrency } =
          await connectStripe({
            db,
            orgId: org.id,
            logger: req.logtail,
            apiKey: stripe_live_key,
            env: AppEnv.Live,
          });

        prodKey = await createKey({
          db,
          orgId: org.id,
          env: AppEnv.Live,
          name: "Platform API Key",
          prefix: "am_sk_live",
          meta: {},
        });

        finalStripeConfig = {
          ...finalStripeConfig,
          live_api_key,
          live_webhook_secret,
        };

        if (!defaultCurrency) {
          defaultCurrency = stripeCurrency || "usd";
        }
      }

      if (!org.stripe_config?.success_url) {
        finalStripeConfig.success_url = `https://useautumn.com`;
      }

      await db
        .update(organizations)
        .set({
          default_currency: defaultCurrency,
          stripe_connected: true,
          stripe_config: {
            ...org.stripe_config,
            ...finalStripeConfig,
          } as StripeConfig,
        })
        .where(eq(organizations.id, org.id));
      res.status(200).json({
        // org: {
        //   id: org.id,
        //   slug: org.slug,
        //   name: org.name,
        // },
        // user: {
        //   id: user.id!,
        //   email,
        // },
        api_keys: {
          sandbox: sandboxKey,
          production: prodKey,
        },
      });
    },
  })
);

export { platformRouter };
