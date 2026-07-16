/**
 * TDD test for customize.upsert_licenses on billing.attach.
 *
 * Contract under test:
 *   New types/fields:
 *     - AttachParamsV1.customize.upsert_licenses: [{ license_plan_id,
 *       included?, prepaid_only?, customize?: { price?, add_items?, remove_items? } }]
 *   New behaviors:
 *     - attach pro (free) with dev-seat license (catalog: 20/mo, 100 msgs/mo,
 *       included 2) customized to 40/mo + 500 msgs/mo, quantity 3
 *       -> pool granted 3 (included 2 + paid 1), paid seat bills the CUSTOM
 *          price: one invoice, total 40
 *     - licenses.attach an entity -> seat provisions the customized product:
 *       entity messages balance granted 500
 *   Side effects:
 *     - customer license pool counters + entity balances surface the
 *       customized definition through the API
 */
import { test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	ApiEntityV2,
	AttachParamsV1Input,
} from "@autumn/shared";
import { BillingInterval } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseAttachPreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const CATALOG_SEAT_PRICE = 20;
const CUSTOM_SEAT_PRICE = 40;
const CATALOG_MESSAGES = 100;
const CUSTOM_MESSAGES = 500;
const INCLUDED_SEATS = 2;
const REQUESTED_SEATS = 3;
const PAID_SEATS = REQUESTED_SEATS - INCLUDED_SEATS;

test.concurrent(
	`${chalk.yellowBright("license-attach-customize: upsert_licenses bills custom price and provisions custom items")}`,
	async () => {
		const customerId = "license-attach-customize";
		const pro = products.base({
			id: "customize-pro",
			items: [items.dashboard()],
		});
		const devSeat = products.base({
			id: "customize-dev-seat",
			items: [
				items.monthlyPrice({ price: CATALOG_SEAT_PRICE }),
				items.monthlyMessages({ includedUsage: CATALOG_MESSAGES }),
			],
			group: "customize-dev-seat-licenses",
		});

		const { ctx, autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro, devSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: devSeat.id,
					included: INCLUDED_SEATS,
				}),
			],
		});

		const attachParams: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
			license_quantities: [
				{ license_plan_id: devSeat.id, quantity: REQUESTED_SEATS },
			],
			customize: {
				upsert_licenses: [
					{
						license_plan_id: devSeat.id,
						customize: {
							price: {
								amount: CUSTOM_SEAT_PRICE,
								interval: BillingInterval.Month,
							},
							remove_items: [{ feature_id: TestFeature.Messages }],
							add_items: [
								itemsV2.monthlyMessages({ included: CUSTOM_MESSAGES }),
							],
						},
					},
				],
			},
		};

		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(attachParams);
		expectLicenseAttachPreviewCorrect({
			preview,
			total: PAID_SEATS * CUSTOM_SEAT_PRICE,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>(attachParams);

		// ── Pool: counters inherit catalog included, custom def anchored ──
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: devSeat.id,
					parent_plan_id: pro.id,
					granted: REQUESTED_SEATS,
					usage: 0,
					remaining: REQUESTED_SEATS,
					paid_quantity: PAID_SEATS,
				},
			],
		});
		// ── Invoice: 1 paid seat × CUSTOM $40/mo (not catalog $20) ────────
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: PAID_SEATS * CUSTOM_SEAT_PRICE,
		});

		// ── Stripe sub: verify agrees with the custom seat price ─────────
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		// ── Seat provisioning: entity gets the CUSTOM 500 msgs/mo ────────
		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: devSeat.id,
			entities: [
				{
					entity_id: "customize-seat-1",
					name: "Seat 1",
					feature_id: TestFeature.Users,
				},
			],
		});

		const seatEntity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			"customize-seat-1",
		);
		expectBalanceCorrect({
			customer: seatEntity,
			featureId: TestFeature.Messages,
			granted: CUSTOM_MESSAGES,
		});

		// ── Pool counters + Stripe stay correct after assignment ─────────
		const customerAfter =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer: customerAfter,
			count: 1,
			licenses: [
				{
					license_plan_id: devSeat.id,
					granted: REQUESTED_SEATS,
					usage: 1,
					remaining: REQUESTED_SEATS - 1,
					paid_quantity: PAID_SEATS,
				},
			],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
