import {
	AppEnv,
	ErrCode,
	member,
	type Organization,
	organizations,
	RecaseError,
	type StripeConfig,
	user as userTable,
} from "@autumn/shared";
import { generateId } from "better-auth";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { handleStripeSecretKey } from "@/internal/orgs/orgUtils/handleStripeSecretKey.js";
import { shouldReconnectStripe } from "@/internal/orgs/orgUtils.js";
import { afterOrgCreated } from "@/utils/authUtils/afterOrgCreated.js";

const ExchangeSchema = z.object({
	organization: z
		.object({
			name: z.string().min(1),
			slug: z.string().min(1),
		})
		.nullish(),
	email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
	stripe_test_key: z.string().min(1).optional(),
	stripe_live_key: z.string().min(1).optional(),
});

export const handleLegacyPlatformExchange = createRoute({
	body: ExchangeSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, logger, org: requestingOrg } = ctx;
		const { organization, email, stripe_test_key, stripe_live_key } =
			c.req.valid("json");

		if (!stripe_test_key && !stripe_live_key) {
			throw new RecaseError({
				message: "Either stripe_test_key or stripe_live_key is required",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
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
					createdBy: requestingOrg.id,
				})
				.returning();
		}

		logger.info(`User found / created: ${user.id} (${email})`);

		let org: Organization;

		const orgSlug = organization?.slug
			? `${organization.slug}_${requestingOrg.id}`
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
					eq(organizations.created_by, requestingOrg.id),
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
					name: organization?.name || `Platform Org (${requestingOrg.id})`,
					logo: "",
					createdAt: new Date(),
					metadata: "",
					created_by: requestingOrg.id,
				})
				.returning()) as [Organization];

			await db.insert(member).values({
				id: generateId(),
				organizationId: orgId,
				userId: user.id!,
				role: "owner",
				createdAt: new Date(),
			});

			await afterOrgCreated({ org, user, createStripeAccount: false });
		} else {
			org = membership.organizations as Organization;
		}

		let sandboxKey: string | undefined;
		let prodKey: string | undefined;

		let finalStripeConfig: StripeConfig = {};
		let defaultCurrency = org.default_currency || "usd";

		// Connect stripe if not exists...
		if (stripe_test_key) {
			const reconnectStripe = await shouldReconnectStripe({
				org,
				env: AppEnv.Sandbox,
				stripeKey: stripe_test_key,
				logger,
			});

			if (reconnectStripe) {
				const {
					test_api_key,
					test_webhook_secret,
					defaultCurrency: newDefaultCurrency,
				} = await handleStripeSecretKey({
					orgId: org.id,
					secretKey: stripe_test_key,
					env: AppEnv.Sandbox,
				});

				finalStripeConfig = {
					...finalStripeConfig,
					test_api_key,
					test_webhook_secret: test_webhook_secret ?? undefined,
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
				logger,
			});

			if (reconnectStripe) {
				console.log("Reconnecting stripe live");
				const {
					live_api_key,
					live_webhook_secret,
					defaultCurrency: newDefaultCurrency,
				} = await handleStripeSecretKey({
					orgId: org.id,
					secretKey: stripe_live_key,
					env: AppEnv.Live,
				});

				finalStripeConfig = {
					...finalStripeConfig,
					live_api_key,
					live_webhook_secret: live_webhook_secret ?? undefined,
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

		return c.json({
			api_keys: {
				sandbox: sandboxKey,
				production: prodKey,
			},
		});
	},
});
