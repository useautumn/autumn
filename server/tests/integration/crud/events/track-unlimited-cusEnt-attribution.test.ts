import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type TrackResponseV3,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import {
	cleanupOrgRollout,
	setOrgRolloutPercent,
} from "@tests/utils/rolloutTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import {
	customerEntitlements,
	events,
	products as productsTable,
} from "@autumn/shared";

const TINYBIRD_INGEST_WAIT_MS = 3000;

test(
	`${chalk.yellowBright("unlimited-cusent-attribution: track on customer with mixed unlimited+limited entitlements attributes the event to the unlimited plan")}`,
	async () => {
		const customerId = `unlimited-cusent-attribution-${Date.now()}`;

		const baseProd = products.base({
			id: "base-limited",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const unlimitedAddon = products.base({
			id: "unlimited-addon",
			items: [items.unlimitedMessages()],
			isAddOn: true,
		});

		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [baseProd, unlimitedAddon] }),
			],
			actions: [
				s.attach({ productId: baseProd.id }),
				s.attach({ productId: unlimitedAddon.id }),
			],
		});

		const orgId = ctx.org.id;

		try {
			await setOrgRolloutPercent({ orgId, percent: 100 });

			const unlimitedPlanId = unlimitedAddon.id;
			const unlimitedProductRow = await db
				.select({ internal_id: productsTable.internal_id })
				.from(productsTable)
				.where(
					and(
						eq(productsTable.org_id, orgId),
						eq(productsTable.env, ctx.env),
						eq(productsTable.id, unlimitedPlanId),
					),
				)
				.limit(1);
			const expectedUnlimitedInternalId =
				unlimitedProductRow[0]?.internal_id ?? null;
			expect(expectedUnlimitedInternalId).not.toBeNull();

			const TRACK_VALUE = 7;
			const trackResponse = (await autumnV2_2.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: TRACK_VALUE,
			})) as TrackResponseV3;

			expect(trackResponse.deductions).toBeDefined();
			expect(trackResponse.deductions ?? []).toHaveLength(1);
			const responseDeduction = (trackResponse.deductions ?? [])[0];
			expect(responseDeduction?.feature_id).toBe(TestFeature.Messages);
			expect(responseDeduction?.plan_id).toBe(unlimitedPlanId);
			expect(responseDeduction?.value).toBe(TRACK_VALUE);

			await timeout(TINYBIRD_INGEST_WAIT_MS);

			const customer = (await autumnV2_2.customers.get(customerId, {
				with_autumn_id: true,
			})) as ApiCustomerV5 & { autumn_id?: string };
			const internalCustomerId = customer.autumn_id;
			expect(internalCustomerId).toBeDefined();

			const eventRows = await db
				.select({
					id: events.id,
					event_name: events.event_name,
					value: events.value,
					entity_id: events.entity_id,
					internal_product_id: events.internal_product_id,
					deductions: events.deductions,
				})
				.from(events)
				.where(
					and(
						eq(events.org_id, orgId),
						eq(events.env, ctx.env),
						eq(events.internal_customer_id, internalCustomerId as string),
					),
				)
				.orderBy(desc(events.created_at))
				.limit(5);

			expect(eventRows.length).toBeGreaterThan(0);
			const latestEvent = eventRows[0];

			expect(latestEvent.internal_product_id).toBe(
				expectedUnlimitedInternalId,
			);

			expect(latestEvent.deductions).not.toBeNull();
			expect(latestEvent.deductions ?? []).toHaveLength(1);
			const persistedDeduction = (latestEvent.deductions ?? [])[0];
			expect(persistedDeduction?.feature_id).toBe(TestFeature.Messages);
			expect(persistedDeduction?.plan_id).toBe(unlimitedPlanId);
			expect(persistedDeduction?.value).toBe(TRACK_VALUE);

			expect(latestEvent.entity_id).toBeNull();

			const cusEntRows = await db
				.select({
					id: customerEntitlements.id,
					balance: customerEntitlements.balance,
					unlimited: customerEntitlements.unlimited,
				})
				.from(customerEntitlements)
				.where(
					eq(
						customerEntitlements.internal_customer_id,
						internalCustomerId as string,
					),
				);
			const limitedRow = cusEntRows.find((r) => !r.unlimited);
			const unlimitedRow = cusEntRows.find((r) => r.unlimited);
			expect(limitedRow?.balance).toBe(100);
			expect(unlimitedRow?.unlimited).toBe(true);
		} finally {
			await cleanupOrgRollout({ orgId });
		}
	},
	{ timeout: 120_000 },
);
