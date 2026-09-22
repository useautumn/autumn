/**
 * invoices.reissue on a card invoice for an org whose invoice-mode payment
 * methods include customer_balance.
 *
 * Contract:
 *   allowed_payment_methods applies to send-invoice replacements only; a card
 *   replacement is created without payment_method_types, so Stripe does not
 *   reject customer_balance on a charge_automatically invoice.
 */

import { expect, test } from "bun:test";
import type { ApiListInvoiceV1 } from "@autumn/shared";
import { organizations } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { SECRET_KEY_L1_TTL_MS } from "@/external/redis/actions/secretKeyCache/secretKeyCache";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache";

const withInvoicePaymentMethods = async <T>({
	ctx,
	fn,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	fn: () => Promise<T>;
}) => {
	const { db, org } = ctx;
	await db
		.update(organizations)
		.set({
			config: {
				...org.config,
				allowed_payment_methods: ["card", "customer_balance"],
			},
		})
		.where(eq(organizations.id, org.id));
	await clearOrgCache({ db, orgId: org.id });
	// The server also holds the org in a per-process L1 that only expires.
	await timeout(SECRET_KEY_L1_TTL_MS + 500);
	try {
		return await fn();
	} finally {
		await db
			.update(organizations)
			.set({ config: org.config })
			.where(eq(organizations.id, org.id));
		await clearOrgCache({ db, orgId: org.id });
		await timeout(SECRET_KEY_L1_TTL_MS + 500);
	}
};

const cardInvoiceScenario = async ({
	customerId,
	planId,
}: {
	customerId: string;
	planId: string;
}) => {
	const pro = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const { list } = (await scenario.autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	return { ...scenario, original: list[0] };
};

test(`${chalk.yellowBright("invoices.reissue: card replacement is created without the org's invoice payment methods")}`, async () => {
	const { ctx, autumnV2_3, original } = await cardInvoiceScenario({
		customerId: "inv-reissue-card-methods",
		planId: "pro-reissue-card-methods",
	});
	await withInvoicePaymentMethods({
		ctx,
		fn: async () => {
			const { preview } = (await autumnV2_3.post("/invoices.reissue", {
				invoice_id: original.id,
				preview: true,
			})) as { preview: { total: number } };
			expect(preview.total).toBe(original.total);

			const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
				invoice_id: original.id,
			})) as { invoice: ApiListInvoiceV1 };
			const replacement = await ctx.stripeCli.invoices.retrieve(
				invoice.stripe_id,
			);
			expect(replacement.collection_method).toBe("charge_automatically");
			expect(replacement.payment_settings.payment_method_types).toBeNull();
			expect(replacement.status).toBe("paid");
		},
	});
});

test(`${chalk.yellowBright("invoices.reissue: send-invoice replacement of a card invoice keeps the org's invoice payment methods")}`, async () => {
	const { ctx, autumnV2_3, original } = await cardInvoiceScenario({
		customerId: "inv-reissue-card-methods-terms",
		planId: "pro-reissue-card-methods-terms",
	});
	await withInvoicePaymentMethods({
		ctx,
		fn: async () => {
			const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
				invoice_id: original.id,
				net_terms_days: 7,
			})) as { invoice: ApiListInvoiceV1 };
			const replacement = await ctx.stripeCli.invoices.retrieve(
				invoice.stripe_id,
			);
			expect(replacement.collection_method).toBe("send_invoice");
			expect(replacement.payment_settings.payment_method_types).toEqual([
				"card",
				"customer_balance",
			]);
		},
	});
});
