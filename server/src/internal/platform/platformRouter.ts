import {
	AppEnv,
	member,
	type Organization,
	organizations,
	type StripeConfig,
	user as userTable,
} from "@autumn/shared";
import { Autumn } from "autumn-js";
import { generateId } from "better-auth";
import { and, eq } from "drizzle-orm";
import { type NextFunction, Router } from "express";
import { z } from "zod";
import { afterOrgCreated } from "@/utils/authUtils/afterOrgCreated.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { createKey } from "../dev/api-keys/apiKeyUtils.js";
import { connectStripe } from "../orgs/handlers/handleConnectStripe_old.js";

import { shouldReconnectStripe } from "../orgs/orgUtils.js";

const platformRouter = Router();

const platformAuthMiddleware = async (
	req: any,
	res: any,
	next: NextFunction,
) => {
	if (!process.env.AUTUMN_SECRET_KEY) next();

	try {
		const autumn = new Autumn();
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
		req.logger.error(`Failed to check if org is allowed to access platform`, {
			error,
		});
		res.status(500).json({
			message: "Failed to check if org is allowed to access platform",
			code: "internal_error",
		});
	}
};

platformRouter.use(platformAuthMiddleware);

const ExchangeSchema = z.object({
	// organization_name: z.string().nullish(),
	// organization_slug: z.string().nullish(),
	organization: z
		.object({
			name: z.string().nonempty(),
			slug: z.string().nonempty(),
		})
		.nullish(),
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
			const { organization, email, stripe_test_key, stripe_live_key } =
				req.body;

			const { db, logger } = req;

			ExchangeSchema.parse({
				organization,
				email,
				stripe_test_key,
				stripe_live_key,
			});

			if (!stripe_test_key && !stripe_live_key) {
				res.status(400).json({
					message: "Either stripe_test_key or stripe_live_key is required",
					code: "invalid_request",
				});
				return;
			}

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

			// let membership = await db.query.member.findFirst({
			//   with: {
			//     organization: true,
			//   },
			//   where: and(
			//     eq(member.userId, user.id!),
			//     eq(member.role, "owner"),
			//     organization_slug
			//       ? eq(organizations.slug, organization_slug)
			//       : undefined,
			//     eq(organizations.created_by, req.org.id)
			//   ),
			// });
			const orgSlug = organization?.slug
				? `${organization.slug}_${req.org.id}`
				: undefined;
			const data = await db
				.select()
				.from(member)
				.innerJoin(organizations, eq(member.organizationId, organizations.id))
				.where(
					and(
						eq(member.userId, user.id!),
						eq(member.role, "owner"),
						orgSlug ? eq(organizations.slug, orgSlug) : undefined,
						eq(organizations.created_by, req.org.id),
					),
				);

			const membership = data.length > 0 ? data[0] : null;

			if (!membership) {
				logger.info(`Connected to Stripe`);

				// 2. Create org
				const orgId = generateId();

				[org] = (await db
					.insert(organizations)
					.values({
						id: orgId,
						slug: orgSlug
							? orgSlug
							: `platform_org_${Math.floor(10000000 + Math.random() * 90000000)}`,

						name: organization?.name || `Platform Org (${req.org.id})`,
						logo: "",
						createdAt: new Date(),
						metadata: "",
						created_by: req.org.id,
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
				// org = (await db.query.organizations.findFirst({
				//   where: eq(organizations.id, membership.organizationId),
				// })) as Organization;
				org = membership.organizations as Organization;
			}

			let sandboxKey, prodKey;

			let finalStripeConfig: any = {};
			let defaultCurrency = org.default_currency || "usd";

			// Connect stripe if not exists...
			if (stripe_test_key) {
				const reconnectStripe = await shouldReconnectStripe({
					org,
					env: AppEnv.Sandbox,
					stripeKey: stripe_test_key,
					logger: req.logger,
				});

				if (reconnectStripe) {
					const {
						test_api_key,
						test_webhook_secret,
						defaultCurrency: newDefaultCurrency,
					} = await connectStripe({
						orgId: org.id,
						apiKey: stripe_test_key,
						env: AppEnv.Sandbox,
					});

					finalStripeConfig = {
						...finalStripeConfig,
						test_api_key,
						test_webhook_secret,
					};

					if (!defaultCurrency) {
						defaultCurrency = newDefaultCurrency || "usd";
					}
				}

				sandboxKey = await createKey({
					db,
					orgId: org.id,
					env: AppEnv.Sandbox,
					name: "Platform API Key",
					prefix: "am_sk_test",
					meta: {},
				});
			}

			if (stripe_live_key) {
				const reconnectStripe = await shouldReconnectStripe({
					org,
					env: AppEnv.Live,
					stripeKey: stripe_live_key,
					logger: req.logger,
				});

				if (reconnectStripe) {
					console.log("Reconnecting stripe live");
					const {
						live_api_key,
						live_webhook_secret,
						defaultCurrency: newDefaultCurrency,
					} = await connectStripe({
						orgId: org.id,
						apiKey: stripe_live_key,
						env: AppEnv.Live,
					});

					finalStripeConfig = {
						...finalStripeConfig,
						live_api_key,
						live_webhook_secret,
					};

					if (!defaultCurrency) {
						defaultCurrency = newDefaultCurrency || "usd";
					}
				}

				prodKey = await createKey({
					db,
					orgId: org.id,
					env: AppEnv.Live,
					name: "Platform API Key",
					prefix: "am_sk_live",
					meta: {},
				});
			}

			// if (!org.stripe_config?.success_url) {
			//   finalStripeConfig.success_url = `https://useautumn.com`;
			// }

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
	}),
);

export { platformRouter };
