/**
 * TDD test for paid license quantities on attach.
 *
 * Contract under test:
 *   New types/fields:
 *     - AttachParamsV1.license_quantities: [{ license_plan_id, quantity }]
 *     - ApiCustomerV5.licenses: [{ license_plan_id, parent_plan_id,
 *       license_plan_name, granted, usage, remaining, paid_quantity }]
 *   New behaviors:
 *     - attach pro (free) with dev-seat license (20/mo, included 2) and
 *       quantity 5 -> paid_quantity 3, granted 5 (included 2 + paid 3)
 *     - invoice charges 3 paid seats -> one invoice, total 60
 *     - stripe subscription carries the dev-seat price at quantity 3
 *       (unused prepaid buffer) — asserted via /billing.verify, whose
 *       expected state is built from the license billing price rows
 *   Side effects:
 *     - customer_licenses pool counters surface through customer.licenses
 */
import { test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseAttachPreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const DEV_SEAT_PRICE = 20;
const INCLUDED_SEATS = 2;
const REQUESTED_SEATS = 5;
const PAID_SEATS = REQUESTED_SEATS - INCLUDED_SEATS;

test.concurrent(
	`${chalk.yellowBright("license-attach: paid license quantity invoices monthly seats")}`,
	async () => {
		const customerId = "license-attach-paid-quantity";
		const pro = products.base({
			id: "pro",
			items: [items.dashboard()],
		});
		const devSeat = products.base({
			id: "dev-seat",
			items: [items.monthlyPrice({ price: DEV_SEAT_PRICE })],
			group: "dev-seat-licenses",
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
		};
		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(attachParams);
		expectLicenseAttachPreviewCorrect({
			preview,
			total: PAID_SEATS * DEV_SEAT_PRICE,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>(attachParams);

		// ── Customer object: licenses field ──────────────────────────────
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

		// ── Invoice: 3 paid seats × $20/mo ────────────────────────────────
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: PAID_SEATS * DEV_SEAT_PRICE,
		});

		// ── Stripe sub: production verify agrees (license-aware) ─────────
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("license-attach: seat assignments keep stripe billed units at paid quantity")}`,
	async () => {
		const customerId = "license-attach-seat-invariant";
		const pro = products.base({
			id: "seat-pro",
			items: [items.dashboard()],
		});
		const devSeat = products.base({
			id: "seat-dev",
			items: [items.monthlyPrice({ price: DEV_SEAT_PRICE })],
			group: "seat-dev-licenses",
		});

		const { ctx, autumnV2_3 } = await initScenario({
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

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
			license_quantities: [
				{ license_plan_id: devSeat.id, quantity: REQUESTED_SEATS },
			],
		});

		// 4 of 5 seats assigned: 2 ride free (included), 2 bill as seat
		// snapshots, buffer shrinks to 1 — billed units stay at paid_quantity.
		await autumnV2_3.post("/licenses.attach", {
			customer_id: customerId,
			plan_id: devSeat.id,
			entities: [1, 2, 3, 4].map((index) => ({
				entity_id: `seat-entity-${index}`,
				name: `Seat ${index}`,
				feature_id: TestFeature.Users,
			})),
		});

		// ── Customer object: counters after assignment ───────────────────
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: devSeat.id,
					granted: REQUESTED_SEATS,
					usage: 4,
					remaining: 1,
					paid_quantity: PAID_SEATS,
				},
			],
		});

		// ── Stripe: verify agrees (seat snapshots + buffer merge) ────────
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
