import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	AttachPreviewResponse,
	CreateScheduleParamsV0Input,
} from "@autumn/shared";
import {
	BillingInterval,
	ms,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import {
	expectNextCycleHasNoRefundLines,
	expectNextCycleHasRefundLines,
} from "../../utils/expectNextCycleHasNoRefundLines";

const SEATS = 2;
const INCLUDED_SEATS = 1;
const MONTHLY_PRICE = 45;
const ANNUAL_PRICE = 240;

const paidSeats = (seats: number) => Math.max(seats - INCLUDED_SEATS, 0);

const pricedPlan = ({
	id,
	group,
	price,
	interval,
}: {
	id: string;
	group: string;
	price: number;
	interval: BillingInterval;
}) =>
	products.base({
		id,
		group,
		items: [constructPriceItem({ price, interval })],
	});

const setupBoundarySwitch = async ({
	customerId,
	idPrefix,
	toPrice,
	toInterval,
	toSeats,
}: {
	customerId: string;
	idPrefix: string;
	toPrice: number;
	toInterval: BillingInterval;
	toSeats: number;
}) => {
	const fromParent = pricedPlan({
		id: `${idPrefix}-from-parent`,
		group: `${idPrefix}-parent`,
		price: MONTHLY_PRICE,
		interval: BillingInterval.Month,
	});
	const toParent = pricedPlan({
		id: `${idPrefix}-to-parent`,
		group: `${idPrefix}-parent`,
		price: toPrice,
		interval: toInterval,
	});
	const fromSeat = pricedPlan({
		id: `${idPrefix}-from-seat`,
		group: `${idPrefix}-seat`,
		price: MONTHLY_PRICE,
		interval: BillingInterval.Month,
	});
	const toSeat = pricedPlan({
		id: `${idPrefix}-to-seat`,
		group: `${idPrefix}-seat`,
		price: toPrice,
		interval: toInterval,
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: SEATS, featureId: TestFeature.Users }),
			s.products({ list: [fromParent, toParent, fromSeat, toSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: fromParent.id,
				licenseProductId: fromSeat.id,
				included: INCLUDED_SEATS,
				prepaidOnly: true,
			}),
			s.licenses.link({
				parentProductId: toParent.id,
				licenseProductId: toSeat.id,
				included: INCLUDED_SEATS,
				prepaidOnly: true,
			}),
		],
	});

	await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: fromParent.id,
		license_quantities: [{ license_plan_id: fromSeat.id, quantity: SEATS }],
		redirect_mode: "if_required",
	});

	const preview =
		await scenario.autumnV2_3.billing.previewAttach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: toParent.id,
			license_quantities: [{ license_plan_id: toSeat.id, quantity: toSeats }],
			plan_schedule: "end_of_cycle",
			redirect_mode: "if_required",
		});

	return { preview, scenario };
};

test.concurrent(
	`${chalk.yellowBright("license scheduled transition: monthly to annual at the boundary charges the annual plan only")}`,
	async () => {
		const customerId = "xinterval-boundary-credits";
		const { preview } = await setupBoundarySwitch({
			customerId,
			idPrefix: "xinterval",
			toPrice: ANNUAL_PRICE,
			toInterval: BillingInterval.Year,
			toSeats: SEATS,
		});

		const { billingPeriod } = await getBillingPeriod({ customerId });
		expect(preview.total).toEqual(0);
		expectNextCycleHasNoRefundLines({
			preview,
			startsAt: billingPeriod.end,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license scheduled transition: same-interval boundary switch charges the incoming plan only")}`,
	async () => {
		const customerId = "xinterval-boundary-same-tier";
		const { preview } = await setupBoundarySwitch({
			customerId,
			idPrefix: "xsame",
			toPrice: MONTHLY_PRICE,
			toInterval: BillingInterval.Month,
			toSeats: SEATS,
		});

		const { billingPeriod } = await getBillingPeriod({ customerId });
		expectNextCycleHasNoRefundLines({
			preview,
			startsAt: billingPeriod.end,
			total: MONTHLY_PRICE + paidSeats(SEATS) * MONTHLY_PRICE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license scheduled transition: boundary switch with fewer licenses charges the incoming plan only")}`,
	async () => {
		const customerId = "xinterval-boundary-fewer";
		const fewerSeats = SEATS - 1;
		const { preview } = await setupBoundarySwitch({
			customerId,
			idPrefix: "xfewer",
			toPrice: MONTHLY_PRICE,
			toInterval: BillingInterval.Month,
			toSeats: fewerSeats,
		});

		const { billingPeriod } = await getBillingPeriod({ customerId });
		expectNextCycleHasNoRefundLines({
			preview,
			startsAt: billingPeriod.end,
			total: MONTHLY_PRICE + paidSeats(fewerSeats) * MONTHLY_PRICE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license scheduled transition: mid-cycle switch still credits the outgoing plan")}`,
	async () => {
		const customerId = "xinterval-midcycle-credit";
		const fromParent = pricedPlan({
			id: "xmid-from-parent",
			group: "xmid-parent",
			price: MONTHLY_PRICE,
			interval: BillingInterval.Month,
		});
		const toParent = pricedPlan({
			id: "xmid-to-parent",
			group: "xmid-parent",
			price: MONTHLY_PRICE,
			interval: BillingInterval.Month,
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [fromParent, toParent] }),
			],
			actions: [s.billing.attach({ productId: fromParent.id })],
		});

		const midCycleMs = truncateMsToSecondPrecision(
			scenario.advancedTo + ms.days(5),
		);
		const preview: AttachPreviewResponse = await scenario.autumnV1.post(
			"/billing.preview_create_schedule",
			{
				customer_id: customerId,
				phases: [
					{
						starts_at: scenario.advancedTo,
						plans: [{ plan_id: fromParent.id }],
					},
					{ starts_at: midCycleMs, plans: [{ plan_id: toParent.id }] },
				],
			} satisfies CreateScheduleParamsV0Input,
		);

		expect(preview.next_cycle?.starts_at).toBe(midCycleMs);

		expectNextCycleHasRefundLines({ preview });
	},
);
