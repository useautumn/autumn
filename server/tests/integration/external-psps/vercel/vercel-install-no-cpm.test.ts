import { expect, test } from "bun:test";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import {
	buildTestOidcHeaders,
	setupVercelOrg,
} from "./utils/vercel-test-helpers";

const TEST_CASE = "vinst-nocpm";

const baseUrl = () =>
	(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(
		/\/$/,
		"",
	);

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

const buildUpsertBody = ({ email, name }: { email: string; name: string }) => ({
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

		const vercelProcessor = (created as any)?.processors?.vercel as
			| { custom_payment_method_id?: string }
			| undefined;
		expect(vercelProcessor?.custom_payment_method_id).toBeUndefined();

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
