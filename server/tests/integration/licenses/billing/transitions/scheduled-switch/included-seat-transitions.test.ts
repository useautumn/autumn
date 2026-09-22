/** Scheduled successors rebase paid seats when they activate.
 * Red kept zero paid seats; green bills five assignments minus three included. */
import { test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { TestFeature } from "@tests/setup/v2Features";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";

const ASSIGNED_SEATS = 5;
const TO_INCLUDED_SEATS = 3;
const PAID_SEATS = ASSIGNED_SEATS - TO_INCLUDED_SEATS;
const SEAT_PRICE = 10;
const TO_PARENT_PRICE = 10;

test.concurrent(
	`${chalk.yellowBright("license scheduled transition: included-seat decrease adds paid seats")}`,
	async () => {
		const customerId = "scheduled-included-decrease";
		const fromParent = products.base({
			id: "scheduled-included-from",
			group: "scheduled-included-parent",
			items: [items.monthlyPrice({ price: 100 })],
		});
		const toParent = products.base({
			id: "scheduled-included-to",
			group: "scheduled-included-parent",
			items: [items.monthlyPrice({ price: TO_PARENT_PRICE })],
		});
		const seat = products.base({
			id: "scheduled-included-seat",
			group: "scheduled-included-seat",
			items: [items.monthlyPrice({ price: SEAT_PRICE })],
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: ASSIGNED_SEATS, featureId: TestFeature.Users }),
				s.products({ list: [fromParent, toParent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: fromParent.id,
					licenseProductId: seat.id,
					included: 10,
				}),
				s.licenses.link({
					parentProductId: toParent.id,
					licenseProductId: seat.id,
					included: TO_INCLUDED_SEATS,
				}),
			],
		});
		await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: fromParent.id,
			license_quantities: [
				{ license_plan_id: seat.id, quantity: ASSIGNED_SEATS },
			],
			redirect_mode: "if_required",
		});
		await scenario.autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: seat.id,
			entities: scenario.entities.map((entity) => ({ entity_id: entity.id })),
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: toParent.id,
			redirect_mode: "if_required",
		};
		const preview =
			await scenario.autumnV2_3.billing.previewAttach<AttachParamsV1Input>(
				params,
			);
		const { billingPeriod } = await getBillingPeriod({ customerId });
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: billingPeriod.end,
			total: TO_PARENT_PRICE + PAID_SEATS * SEAT_PRICE,
			toleranceMs: 1000,
		});
		await scenario.autumnV2_3.billing.attach(params);

		if (!scenario.testClockId) throw new Error("Expected a test clock");
		const cycleEnd = addMonths(new Date(scenario.advancedTo), 1);
		await advanceTestClock({
			stripeCli: scenario.ctx.stripeCli,
			testClockId: scenario.testClockId,
			advanceTo: cycleEnd.getTime(),
			waitForSeconds: 10,
		});
		await advanceTestClock({
			stripeCli: scenario.ctx.stripeCli,
			testClockId: scenario.testClockId,
			advanceTo: addHours(cycleEnd, hoursToFinalizeInvoice).getTime(),
			waitForSeconds: 10,
		});

		const customer =
			await scenario.autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					parent_plan_id: toParent.id,
					granted: ASSIGNED_SEATS,
					usage: ASSIGNED_SEATS,
					remaining: 0,
					paid_quantity: PAID_SEATS,
				},
			],
		});
	},
);
