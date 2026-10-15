import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq, sql } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

const NUMERIC_ENTITY_IDS = [101, 202];

test.concurrent(
	`${chalk.yellowBright("invoice.created: per-entity balances stored with numeric entity ids still store the cycle invoice's line items")}`,
	async () => {
		const customerId = "inv-created-numeric-entity-ids";

		const pro = products.pro({
			id: "pro",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await autumnV1.post(
			`/customers/${customerId}/entities`,
			NUMERIC_ENTITY_IDS.map((id) => ({ id, feature_id: TestFeature.Users })),
		);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const perEntityEntitlement = fullCustomer.customer_products
			.flatMap((customerProduct) => customerProduct.customer_entitlements)
			.find((entitlement) => entitlement.feature_id === TestFeature.Messages);
		if (!perEntityEntitlement)
			throw new Error("Messages entitlement not found");

		const storedEntityIds = Object.values(
			perEntityEntitlement.entities ?? {},
		).map((entityBalance) => entityBalance.id);
		expect(storedEntityIds.sort()).toEqual(NUMERIC_ENTITY_IDS.map(String));

		await ctx.db
			.update(customerEntitlements)
			.set({
				entities: sql`(select jsonb_object_agg(key, value || jsonb_build_object('id', key::numeric)) from jsonb_each(${customerEntitlements.entities}))`,
			})
			.where(eq(customerEntitlements.id, perEntityEntitlement.id));
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "invoice-created-numeric-entity-ids-test",
		});

		if (!testClockId) throw new Error("Scenario did not create a test clock");
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			numberOfMonths: 1,
			waitForSeconds: 60,
		});

		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: fullCustomer.processor.id,
			limit: 10,
		});
		const cycleInvoice = stripeInvoices.data.find(
			(invoice) => invoice.billing_reason === "subscription_cycle",
		);
		if (!cycleInvoice) throw new Error("No subscription_cycle invoice found");
		expect(cycleInvoice.status).toBe("draft");

		const lineItems = await waitForInvoiceLineItems({
			stripeInvoiceId: cycleInvoice.id,
		});
		expect(lineItems.some((lineItem) => lineItem.amount === 20)).toBe(true);
	},
);
