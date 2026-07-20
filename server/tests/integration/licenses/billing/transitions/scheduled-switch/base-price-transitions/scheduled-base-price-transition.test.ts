import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiEntityV2,
	AttachParamsV1Input,
} from "@autumn/shared";
import { BillingInterval } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import { expectAssignmentBasePrices } from "../../utils/basePriceTransitionTestUtils";

test.concurrent(
	`${chalk.yellowBright("base price transition: scheduled paid-to-free seats transition at activation")}`,
	async () => {
		const customerId = "bp-scheduled-free";
		const parentA = {
			...products.base({
				id: "sched-pro",
				group: "sched-parent",
				items: [items.dashboard()],
			}),
			name: "Paid Pro",
		};
		const parentB = {
			...products.base({
				id: "sched-free",
				group: "sched-parent",
				items: [items.dashboard()],
			}),
			name: "Free Pro",
		};
		const paidSeat = {
			...products.base({
				id: "sched-paid-seat",
				group: "sched-seat",
				items: [
					constructPriceItem({
						price: 20,
						interval: BillingInterval.Month,
					}),
					items.monthlyMessages({ includedUsage: 100 }),
				],
			}),
			name: "Paid Seat",
		};
		const freeSeat = {
			...products.base({
				id: "sched-free-seat",
				group: "sched-seat",
				items: [items.monthlyMessages({ includedUsage: 250 })],
			}),
			name: "Free Seat",
		};
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parentA, parentB, paidSeat, freeSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parentA.id,
					licenseProductId: paidSeat.id,
					included: 0,
				}),
				s.licenses.link({
					parentProductId: parentB.id,
					licenseProductId: freeSeat.id,
					included: 0,
				}),
			],
		});
		await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parentA.id,
			license_quantities: [{ license_plan_id: paidSeat.id, quantity: 2 }],
			redirect_mode: "if_required",
		});
		await scenario.autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: paidSeat.id,
			entities: scenario.entities.map((entity) => ({ entity_id: entity.id })),
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: parentB.id,
			license_quantities: [{ license_plan_id: freeSeat.id, quantity: 2 }],
			redirect_mode: "if_required",
		};
		const preview =
			await scenario.autumnV2_3.billing.previewAttach<AttachParamsV1Input>(
				params,
			);
		const { billingPeriod } = await getBillingPeriod({ customerId });
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: billingPeriod.end,
			total: 0,
			toleranceMs: 1000,
		});
		await scenario.autumnV2_3.billing.attach(params);

		await expectAssignmentBasePrices({
			ctx: scenario.ctx,
			autumn: scenario.autumnV2_3,
			customerId,
			licensePlanId: paidSeat.id,
			amount: 20,
			count: 2,
		});
		const midCycle =
			await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: midCycle,
			productId: parentA.id,
		});
		await expectProductScheduled({
			customer: midCycle,
			productId: parentB.id,
		});

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

		await expectAssignmentBasePrices({
			ctx: scenario.ctx,
			autumn: scenario.autumnV2_3,
			customerId,
			licensePlanId: freeSeat.id,
			amount: null,
			count: 2,
		});
		const customer =
			await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [parentB.id],
			notPresent: [parentA.id],
		});
		const entity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			scenario.entities[0].id,
		);
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			planId: freeSeat.id,
			granted: 250,
			usage: 0,
			remaining: 250,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 40,
		});
		const stripeSubscriptions = await scenario.ctx.stripeCli.subscriptions.list(
			{
				customer: customer.stripe_id!,
				status: "all",
			},
		);
		expect(stripeSubscriptions.data).toHaveLength(1);
		expect(stripeSubscriptions.data[0]?.status).toBe("canceled");
	},
);
