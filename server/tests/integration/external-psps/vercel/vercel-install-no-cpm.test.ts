/**
 * Regression: `handleUpsertInstallation` must NOT attach a Stripe Custom
 * Payment Method to the Vercel-owned customer.
 *
 * Background:
 *   Vercel customers settle through `marketplace.invoice.paid` +
 *   `invoices.pay({ paid_out_of_band: true })`. Stripe rejects that call
 *   ("Custom payment methods are not supported on invoices.pay") if the
 *   customer's `invoice_settings.default_payment_method` is a CPM, leaving
 *   the Stripe invoice stuck in `open` while Vercel keeps retrying.
 *
 * Red-failure mode (pre-fix):
 *   The install handler called `createCustomStripeCard({ defaultPaymentMethod
 *   : true })`, so every new Vercel customer was created with a CPM as their
 *   Stripe customer default + an attached `type: "custom"` PaymentMethod +
 *   `processors.vercel.custom_payment_method_id` set on the Autumn row.
 *
 * Green-success criteria (post-fix):
 *   1. The Stripe customer has NO `invoice_settings.default_payment_method`.
 *   2. The Stripe customer has NO attached `type: "custom"` PaymentMethod.
 *   3. The Autumn customer's `processors.vercel.custom_payment_method_id`
 *      is undefined.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import {
	buildTestOidcHeaders,
	setupVercelOrg,
} from "./utils/vercel-test-helpers";

const TEST_CASE = "vinst-nocpm";

const baseUrl = () =>
	(process.env.BETTER_AUTH_URL ?? "http://localhost:8080").replace(/\/$/, "");

const installationUrl = (installationId: string) =>
	`${baseUrl()}/webhooks/vercel/${ctx.org.id}/${ctx.env}/v1/installations/${installationId}`;

const upsertInstallationViaHttp = async ({
	installationId,
	body,
}: {
	installationId: string;
	body: unknown;
}) => {
	const response = await fetch(installationUrl(installationId), {
		method: "PUT",
		headers: buildTestOidcHeaders(installationId, "system"),
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

const buildUpsertBody = ({
	email,
	name,
}: {
	email: string;
	name: string;
}) => ({
	scopes: ["read-write:marketplace", "read-write:integration-resource"],
	acceptedPolicies: {
		eula: new Date().toISOString(),
		privacy: new Date().toISOString(),
	},
	credentials: {
		access_token: "test_vercel_access_token",
		token_type: "Bearer",
	},
	account: {
		name,
		url: "https://vercel.com/team/test",
		contact: {
			email,
			name,
		},
	},
});

test.concurrent(
	`${chalk.yellowBright(
		"vercel-install: upsert does not attach a CPM as Stripe customer default",
	)}`,
	async () => {
		const installationId = `icfg_${TEST_CASE}_basic`;
		const email = `${installationId}@example.com`;
		const name = `Vercel Test ${TEST_CASE}`;

		await setupVercelOrg(ctx);

		// Best-effort cleanup so the test is re-runnable. The handler creates
		// the customer keyed by integrationConfigurationId.
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

		const { response } = await upsertInstallationViaHttp({
			installationId,
			body: buildUpsertBody({ email, name }),
		});
		expect(response.status).toBe(200);

		const created = await CusService.getByVercelId({
			ctx,
			vercelInstallationId: installationId,
		});
		expect(created).toBeDefined();

		// The Autumn customer row must not carry a CPM id.
		const vercelProcessor = (created as any)?.processors?.vercel as
			| { custom_payment_method_id?: string }
			| undefined;
		expect(vercelProcessor?.custom_payment_method_id).toBeUndefined();

		// The Stripe customer must have no default payment method and no
		// CPM attached.
		const stripeCustomerId = (created as any)?.processor?.id as string;
		expect(typeof stripeCustomerId).toBe("string");

		const stripeCustomer =
			await ctx.stripeCli.customers.retrieve(stripeCustomerId);
		if (stripeCustomer.deleted)
			throw new Error("Stripe customer unexpectedly deleted");

		expect(stripeCustomer.invoice_settings?.default_payment_method).toBeNull();

		const customPms = await ctx.stripeCli.paymentMethods.list({
			customer: stripeCustomerId,
			type: "custom",
			limit: 10,
		});
		expect(customPms.data.length).toBe(0);
	},
);
