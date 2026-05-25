/**
 * Shared setup helpers for the Vercel integration test suite.
 *
 * Companion to `vercel-webhook-client.ts`. These functions:
 * - Configure the test org with Vercel processor credentials.
 * - Seed an Autumn customer with `processors.vercel` set (no CPM — the new
 *   flow doesn't require one).
 * - Seed a `vercel_resources` row.
 * - Read recorded Vercel SDK calls back from the dev server's test mock
 *   (`/__test/vercel/api`) via the inspector endpoints.
 * - Build the test OIDC bearer token (`test_oidc:<installationId>`) that
 *   `verifyToken` synthesizes claims for outside production.
 * - Hand-craft legacy `charge_automatically` Vercel Stripe subscriptions for
 *   lazy-migration coverage.
 */

// Worktree dev servers use https://wt<N>-api.localhost with self-signed
// certs (see `bun dw identify`). The test process opts out of TLS validation
// for any https request it makes — scoped to the integration-test runtime,
// not the running server.
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
import type Stripe from "stripe";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { createStripeCustomer } from "@/external/stripe/customers/index.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { customerActions } from "@/internal/customers/actions/index.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

// ──────────────────────────────────────────────────────────────────────────
// Org config
// ──────────────────────────────────────────────────────────────────────────

export interface VercelTestOrgConfig {
	clientId?: string;
	clientSecret?: string;
	customPaymentMethodTypeId?: string;
}

/**
 * Idempotently writes the SANDBOX slot of the Vercel processor config used by
 * the test suite. No-op when the config already matches the requested values.
 *
 * IMPORTANT: this writes only to the `sandbox_*` slots and to fields that are
 * env-agnostic (`marketplace_mode`). It MUST NOT touch `client_integration_id`
 * / `client_secret` / `webhook_url` — those are the LIVE-env values and may
 * be the org's real production Vercel credentials. Overwriting them breaks
 * the live OIDC audience check (a previous bug here ate the live values and
 * caused 401s on live-env webhook DELETEs).
 *
 * NOTE: `sandbox_client_secret` is the HMAC secret used to sign sandbox
 * marketplace webhooks — `VercelWebhookClient` must be constructed with the
 * same value.
 */
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
					// LIVE slots intentionally NOT touched — preserve whatever
					// real credentials the org has for production Vercel.
					client_integration_id:
						existing?.client_integration_id ?? clientId,
					client_secret: existing?.client_secret ?? clientSecret,
					webhook_url:
						existing?.webhook_url ?? "https://test.example/webhook",
					// SANDBOX slots are owned by the test suite.
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

	// Refresh ctx.org so downstream reads see the updated config in this run.
	const refreshed = await OrgService.getBySlug({
		db: ctx.db,
		slug: ctx.org.slug!,
	});
	if (refreshed) ctx.org = refreshed;
};

// ──────────────────────────────────────────────────────────────────────────
// Customer seeding
// ──────────────────────────────────────────────────────────────────────────

export interface SeedVercelCustomerOptions {
	ctx: TestContext;
	customerId: string;
	installationId: string;
	accessToken?: string;
	accountId?: string;
	/** Set to a CPM `pm_*` id to simulate a legacy onboarder. Default: omitted. */
	customPaymentMethodId?: string;
}

export interface SeedVercelCustomerResult {
	customer: FullCustomer;
	stripeCustomer: Stripe.Customer;
	internalCustomerId: string;
}

/**
 * Creates an Autumn customer pre-wired with `processors.vercel` and a backing
 * Stripe customer. Mirrors what `handleUpsertInstallation` does but skips the
 * (legacy) CPM creation by default — that's the whole point of the refactor.
 *
 * If `customPaymentMethodId` is provided, sets it on the customer's
 * `processors.vercel.custom_payment_method_id` so we can prove the new code
 * paths still behave correctly for legacy customers.
 */
export const seedVercelCustomer = async ({
	ctx,
	customerId,
	installationId,
	accessToken = "test_vercel_access_token",
	accountId = `acc_test_${installationId}`,
	customPaymentMethodId,
}: SeedVercelCustomerOptions): Promise<SeedVercelCustomerResult> => {
	// Best-effort delete so the test is re-runnable.
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
	} catch {
		// ignore
	}

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

	// Tag the Stripe customer with the installation id so any code path that
	// reads it via stripe metadata behaves like prod.
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

// ──────────────────────────────────────────────────────────────────────────
// Resource seeding
// ──────────────────────────────────────────────────────────────────────────

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
	// Wipe any prior rows for this id (idempotent test reruns).
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

// Local helper to avoid pulling drizzle's full query builder into this file;
// we delete by id+org+env which is unique enough for tests.
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

// ──────────────────────────────────────────────────────────────────────────
// OIDC test token
// ──────────────────────────────────────────────────────────────────────────

/** Builds the test-only bearer token accepted with the explicit allow header. */
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

// ──────────────────────────────────────────────────────────────────────────
// Vercel SDK mock captures
// ──────────────────────────────────────────────────────────────────────────

export interface CapturedVercelCall {
	method: string;
	path: string;
	installationId: string;
	body: any;
	receivedAt: number;
}

const captureBaseUrl = () =>
	`${(process.env.BETTER_AUTH_URL ?? "http://localhost:8080").replace(/\/$/, "")}/__test/vercel/api`;

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
	).catch(() => {
		// best-effort
	});
};

/**
 * Polls the capture inspector until at least one call matching `predicate`
 * has been recorded, or `timeoutMs` elapses. Useful for the
 * "wait for the real Stripe webhook" pattern.
 */
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

// ──────────────────────────────────────────────────────────────────────────
// Legacy Stripe subscription (for lazy-migration tests)
// ──────────────────────────────────────────────────────────────────────────

export interface CreateLegacyVercelSubscriptionOptions {
	ctx: TestContext;
	stripeCustomerId: string;
	installationId: string;
	billingPlanId: string;
	productId: string;
	resourceId?: string;
	/** Stripe Price id (recurring). Caller must create the price beforehand. */
	stripePriceId: string;
}

/**
 * Creates a Stripe subscription with `collection_method: "charge_automatically"`
 * and the Vercel metadata that the (old) provisioning path used to write. Tests
 * use this to assert the lazy-migration helper flips the subscription to
 * `send_invoice`.
 */
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
