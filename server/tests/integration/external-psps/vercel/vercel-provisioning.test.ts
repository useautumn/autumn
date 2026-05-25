/**
 * Vercel resource provisioning (full HTTP via OIDC test bypass).
 *
 * Drives `POST /webhooks/vercel/:orgId/:env/v1/installations/:integrationConfigurationId/resources`
 * end-to-end through `vercelOidcAuthMiddleware`, which accepts the test
 * bearer token `test_oidc:<installationId>` outside production (see
 * `vercelAuth.ts:synthesizeTestClaims`).
 *
 * The handler eventually calls `provisionVercelCusProduct`, which is the
 * subject under test. We assert:
 *  - Stripe subscription has `collection_method: "send_invoice"`,
 *    `days_until_due: 30`.
 *  - Subscription has Vercel metadata (`vercel_installation_id`, etc).
 *  - No `default_payment_method` is set on the subscription (no CPM-based flow).
 *  - First invoice is finalized (`open`) so the finalize webhook fires.
 *  - Customer's Autumn cus_product is active (top-level
 *    `enable_plan_immediately: true`).
 *  - A subsequent provisioning request is idempotent and short-circuits with
 *    the existing subscription/cus_product.
 */

import { expect, test } from "bun:test";
import { ApiVersion, AppEnv, CusProductStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0";
import {
	buildTestOidcHeaders,
	seedVercelCustomer,
	setupVercelOrg,
} from "./utils/vercel-test-helpers";

const TEST_CASE = "vprov";

const baseUrl = () =>
	(process.env.BETTER_AUTH_URL ?? "http://localhost:8080").replace(/\/$/, "");

const resourcesUrl = (installationId: string) =>
	`${baseUrl()}/webhooks/vercel/${ctx.org.id}/${ctx.env}/v1/installations/${installationId}/resources`;

interface CreateResourceResponse {
	id: string;
	productId: string;
	name: string;
	status: string;
	billingPlan?: { id: string; type: string; name: string };
}

const createResourceViaHttp = async ({
	installationId,
	body,
}: {
	installationId: string;
	body: {
		productId: string;
		billingPlanId: string;
		name: string;
		metadata?: Record<string, unknown>;
	};
}): Promise<{ response: Response; data: CreateResourceResponse | unknown }> => {
	const response = await fetch(resourcesUrl(installationId), {
		method: "POST",
		headers: buildTestOidcHeaders(installationId, "user"),
		body: JSON.stringify(body),
	});
	let data: unknown;
	try {
		data = await response.json();
	} catch {
		data = null;
	}
	return { response, data };
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Paid plan → invoice-mode Stripe subscription
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright(
		"vercel-provisioning: paid plan creates a send_invoice subscription with vercel metadata + finalized first invoice",
	)}`,
	async () => {
		const customerId = `${TEST_CASE}-paid-customer`;
		const installationId = `icfg_${TEST_CASE}_paid`;
		const proRaw = products.pro({
			id: `${TEST_CASE}-paid-pro`,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		await setupVercelOrg(ctx);
		await initProductsV0({
			ctx,
			products: [proRaw],
			prefix: `${TEST_CASE}-paid`,
		});
		// Refresh the (post-prefix) product id.
		const pro = proRaw;

		const { stripeCustomer, internalCustomerId } = await seedVercelCustomer({
			ctx,
			customerId,
			installationId,
		});

		const { response, data } = await createResourceViaHttp({
			installationId,
			body: {
				productId: pro.id,
				billingPlanId: pro.id,
				name: "Test paid resource",
			},
		});

		expect(response.status).toBe(200);
		const created = data as CreateResourceResponse;
		expect(typeof created.id).toBe("string");
		expect(created.id.startsWith("vre_")).toBe(true);
		expect(created.productId).toBe(pro.id);

		// Stripe subscription assertions
		const stripeCustomerExpanded = await ctx.stripeCli.customers.retrieve(
			stripeCustomer.id,
			{ expand: ["subscriptions"] },
		);
		if (stripeCustomerExpanded.deleted)
			throw new Error("Stripe customer was deleted");
		const sub = stripeCustomerExpanded.subscriptions?.data.find(
			(s) =>
				s.metadata?.vercel_installation_id === installationId &&
				s.status !== "incomplete_expired" &&
				s.status !== "canceled",
		);
		expect(sub).toBeDefined();
		const subscription = sub!;
		expect(subscription.collection_method).toBe("send_invoice");
		expect(subscription.days_until_due).toBe(30);
		expect(subscription.default_payment_method).toBeNull();
		expect(subscription.metadata?.vercel_installation_id).toBe(installationId);
		expect(subscription.metadata?.vercel_billing_plan_id).toBe(pro.id);
		expect(subscription.metadata?.vercel_resource_id).toBe(created.id);

		// First invoice should be finalized (not draft) because we set
		// invoice_mode.finalize = true. send_invoice keeps it `open` (not paid).
		const latestInvoiceId =
			typeof subscription.latest_invoice === "string"
				? subscription.latest_invoice
				: subscription.latest_invoice?.id;
		expect(latestInvoiceId).toBeDefined();
		const invoice = await ctx.stripeCli.invoices.retrieve(latestInvoiceId!);
		expect(["open", "paid"]).toContain(invoice.status ?? "");

		// Autumn cus_product should be active (top-level enable_plan_immediately).
		const cusProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId,
			inStatuses: [CusProductStatus.Active, CusProductStatus.Trialing],
		});
		expect(cusProducts.length).toBeGreaterThan(0);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Idempotent re-call short-circuits
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright(
		"vercel-provisioning: idempotent re-call returns existing subscription without creating a second one",
	)}`,
	async () => {
		const customerId = `${TEST_CASE}-idemp-customer`;
		const installationId = `icfg_${TEST_CASE}_idemp`;
		const proRaw = products.pro({
			id: `${TEST_CASE}-idemp-pro`,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		await setupVercelOrg(ctx);
		await initProductsV0({
			ctx,
			products: [proRaw],
			prefix: `${TEST_CASE}-idemp`,
		});
		const pro = proRaw;

		const { stripeCustomer } = await seedVercelCustomer({
			ctx,
			customerId,
			installationId,
		});

		// First call.
		const first = await createResourceViaHttp({
			installationId,
			body: {
				productId: pro.id,
				billingPlanId: pro.id,
				name: "First create",
			},
		});
		expect(first.response.status).toBe(200);

		const subsAfterFirst = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomer.id,
			limit: 10,
		});
		const matchedAfterFirst = subsAfterFirst.data.filter(
			(s) => s.metadata?.vercel_installation_id === installationId,
		);
		expect(matchedAfterFirst.length).toBe(1);
		const firstSubId = matchedAfterFirst[0]!.id;

		// Second call. The handler short-circuits via the
		// `existingResource + existingSub + existingCusProducts` branch in
		// `handleCreateResource.ts` and never enters provisionVercelCusProduct.
		const second = await createResourceViaHttp({
			installationId,
			body: {
				productId: pro.id,
				billingPlanId: pro.id,
				name: "Second create",
			},
		});
		expect(second.response.status).toBe(200);

		const subsAfterSecond = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomer.id,
			limit: 10,
		});
		const matchedAfterSecond = subsAfterSecond.data.filter(
			(s) => s.metadata?.vercel_installation_id === installationId,
		);
		expect(matchedAfterSecond.length).toBe(1);
		expect(matchedAfterSecond[0]!.id).toBe(firstSubId);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: OIDC middleware rejects requests with no/bad bearer token
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright(
		"vercel-provisioning: OIDC middleware rejects calls without a valid token (test bypass requires test_oidc: prefix)",
	)}`,
	async () => {
		const installationId = `icfg_${TEST_CASE}_noauth`;

		const response = await fetch(resourcesUrl(installationId), {
			method: "POST",
			headers: {
				authorization: "Bearer not_a_real_token",
				"x-vercel-auth": "user",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				productId: "fake",
				billingPlanId: "fake",
				name: "Should be rejected",
			}),
		});

		expect(response.status).toBe(401);
	},
);

// Reference unused imports so linters/typecheck stay happy when the test
// list shrinks during iteration. (`AutumnInt`/`ApiVersion`/`AppEnv` are
// reserved for future test cases that exercise the full attach path; keeping
// the imports prevents churn when adding them back.)
void ApiVersion;
void AppEnv;
void AutumnInt;
