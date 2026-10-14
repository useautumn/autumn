if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import {
	type AppEnv,
	type ExternalProcessors,
	type FullCustomer,
	ProcessorType,
	VercelMarketplaceMode,
} from "@autumn/shared";
import { vercelResources } from "@shared/models/processorModels/vercelModels/vercelResourcesTable.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import type Stripe from "stripe";
import { createStripeCustomer } from "@/external/stripe/customers/index.js";
import { customerActions } from "@/internal/customers/actions/index.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export interface VercelTestOrgConfig {
	clientId?: string;
	clientSecret?: string;
	customPaymentMethodTypeId?: string;
}

export const setupVercelOrg = async (
	ctx: TestContext,
	{
		clientId = "test_vercel_client_id",
		clientSecret = "test_vercel_client_secret",
		customPaymentMethodTypeId,
	}: VercelTestOrgConfig = {},
) => {
	const existing = ctx.org.processor_configs?.vercel;
	if (
		existing?.sandbox_client_id === clientId &&
		existing?.sandbox_client_secret === clientSecret &&
		existing?.sandbox_webhook_url &&
		existing?.marketplace_mode &&
		(!customPaymentMethodTypeId ||
			existing?.custom_payment_method?.sandbox === customPaymentMethodTypeId)
	) {
		return;
	}

	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			processor_configs: {
				...ctx.org.processor_configs,
				vercel: {
					...(existing ?? {}),
					client_integration_id: existing?.client_integration_id ?? clientId,
					client_secret: existing?.client_secret ?? clientSecret,
					webhook_url: existing?.webhook_url ?? "https://test.example/webhook",
					sandbox_client_id: clientId,
					sandbox_client_secret: clientSecret,
					sandbox_webhook_url:
						existing?.sandbox_webhook_url ?? "https://test.example/webhook",
					marketplace_mode:
						existing?.marketplace_mode ?? VercelMarketplaceMode.Installation,
					...(customPaymentMethodTypeId
						? {
								custom_payment_method: {
									...(existing?.custom_payment_method ?? {}),
									sandbox: customPaymentMethodTypeId,
								},
							}
						: {}),
				},
			},
		},
	});

	const refreshed = await OrgService.getBySlug({
		db: ctx.db,
		slug: ctx.org.slug!,
	});
	if (refreshed) ctx.org = refreshed;
};

export interface SeedVercelCustomerOptions {
	ctx: TestContext;
	customerId: string;
	installationId: string;
	accessToken?: string;
	accountId?: string;
	customPaymentMethodId?: string;
}

export interface SeedVercelCustomerResult {
	customer: FullCustomer;
	stripeCustomer: Stripe.Customer;
	internalCustomerId: string;
}

export const seedVercelCustomer = async ({
	ctx,
	customerId,
	installationId,
	accessToken = "test_vercel_access_token",
	accountId = `acc_test_${installationId}`,
	customPaymentMethodId,
}: SeedVercelCustomerOptions): Promise<SeedVercelCustomerResult> => {
	try {
		const existing = await CusService.getByVercelId({
			ctx,
			vercelInstallationId: installationId,
		});
		if (existing) {
			await CusService.deleteByInternalId({
				db: ctx.db,
				internalId: existing.internal_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
		}
	} catch {}

	const processorsValue: ExternalProcessors = {
		vercel: {
			installation_id: installationId,
			access_token: accessToken,
			account_id: accountId,
			...(customPaymentMethodId
				? { custom_payment_method_id: customPaymentMethodId }
				: {}),
		},
	};

	const created = await customerActions.createWithDefaults({
		ctx,
		customerId,
		customerData: {
			email: `${customerId}@example.com`,
			name: customerId,
			processors: processorsValue,
		},
	});

	const stripeCustomer = await createStripeCustomer({
		ctx,
		customer: created,
	});

	await CusService.update({
		ctx,
		idOrInternalId: created.id || created.internal_id,
		update: {
			processor: {
				id: stripeCustomer.id,
				type: ProcessorType.Stripe,
			},
			processors: processorsValue,
		},
	});

	await ctx.stripeCli.customers.update(stripeCustomer.id, {
		metadata: { vercel_installation_id: installationId },
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId: created.id ?? created.internal_id,
	});

	const refreshed = await CusService.getFull({
		ctx,
		idOrInternalId: created.internal_id,
	});

	return {
		customer: refreshed,
		stripeCustomer,
		internalCustomerId: refreshed.internal_id,
	};
};

export interface SeedVercelResourceOptions {
	ctx: TestContext;
	resourceId: string;
	installationId: string;
	name?: string;
	status?: "ready" | "suspended" | "pending" | "uninstalled";
	metadata?: Record<string, unknown>;
}

export const seedVercelResource = async ({
	ctx,
	resourceId,
	installationId,
	name = `test resource ${resourceId}`,
	status = "ready",
	metadata = {},
}: SeedVercelResourceOptions) => {
	await ctx.db
		.delete(vercelResources)
		.where(
			require_eq(vercelResources.id, resourceId, ctx.org.id, ctx.env, ctx.db),
		);

	await ctx.db.insert(vercelResources).values({
		id: resourceId,
		org_id: ctx.org.id,
		env: ctx.env,
		installation_id: installationId,
		name,
		status,
		metadata,
	});
};

const require_eq = (
	idCol: typeof vercelResources.id,
	id: string,
	orgId: string,
	env: AppEnv,
	_db: TestContext["db"],
) => {
	const { and, eq } = require("drizzle-orm");
	return and(
		eq(idCol, id),
		eq(vercelResources.org_id, orgId),
		eq(vercelResources.env, env),
	);
};

export const buildTestOidcToken = (installationId: string): string =>
	`test_oidc:${installationId}`;

export const buildTestOidcHeaders = (
	installationId: string,
	authType: "user" | "system" = "user",
) => ({
	authorization: `Bearer ${buildTestOidcToken(installationId)}`,
	"x-vercel-auth": authType,
	"x-allow-vercel-test-oidc": "true",
	"content-type": "application/json",
});

export interface CapturedVercelCall {
	method: string;
	path: string;
	installationId: string;
	body: any;
	receivedAt: number;
}

const captureBaseUrl = () =>
	`${(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/__test/vercel/api`;

export const readVercelCaptures = async (
	installationId: string,
): Promise<CapturedVercelCall[]> => {
	const res = await fetch(
		`${captureBaseUrl()}/__captures/${encodeURIComponent(installationId)}`,
	);
	if (!res.ok) {
		throw new Error(
			`readVercelCaptures: ${res.status} for installation=${installationId}`,
		);
	}
	const json = (await res.json()) as { captures: CapturedVercelCall[] };
	return json.captures ?? [];
};

export const clearVercelCaptures = async (
	installationId: string,
): Promise<void> => {
	await fetch(
		`${captureBaseUrl()}/__captures/${encodeURIComponent(installationId)}`,
		{ method: "DELETE" },
	).catch(() => {});
};

export const waitForVercelCapture = async ({
	installationId,
	predicate,
	timeoutMs = 15000,
	intervalMs = 500,
}: {
	installationId: string;
	predicate: (call: CapturedVercelCall) => boolean;
	timeoutMs?: number;
	intervalMs?: number;
}): Promise<CapturedVercelCall | null> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const captures = await readVercelCaptures(installationId).catch(() => []);
		const match = captures.find(predicate);
		if (match) return match;
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	return null;
};

export interface CreateLegacyVercelSubscriptionOptions {
	ctx: TestContext;
	stripeCustomerId: string;
	installationId: string;
	billingPlanId: string;
	productId: string;
	resourceId?: string;
	stripePriceId: string;
}

export const createLegacyVercelSubscription = async ({
	ctx,
	stripeCustomerId,
	installationId,
	billingPlanId,
	productId,
	resourceId,
	stripePriceId,
}: CreateLegacyVercelSubscriptionOptions): Promise<Stripe.Subscription> => {
	return await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [{ price: stripePriceId }],
		collection_method: "charge_automatically",
		payment_behavior: "default_incomplete",
		metadata: {
			vercel_installation_id: installationId,
			vercel_billing_plan_id: billingPlanId,
			vercel_product_id: productId,
			vercel_resource_id: resourceId ?? installationId,
		},
		expand: ["latest_invoice"],
	});
};
