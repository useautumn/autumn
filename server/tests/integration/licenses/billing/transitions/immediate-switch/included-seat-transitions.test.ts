/** Omitted license quantities rebalance paid seats against live assignments.
 * Red retained paid quantity; green computes assigned seats minus included seats. */
import { test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseUpdatePreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const SEAT_PRICE = 10;

const runIncludedSeatTransition = async ({
	idPrefix,
	fromIncluded,
	toIncluded,
	assignedSeats,
	expectedPaidSeats,
}: {
	idPrefix: string;
	fromIncluded: number;
	toIncluded: number;
	assignedSeats: number;
	expectedPaidSeats: number;
}) => {
	const customerId = `${idPrefix}-customer`;
	const fromParentPrice = 20;
	const toParentPrice = 40;
	const fromParent = products.base({
		id: `${idPrefix}-from`,
		group: `${idPrefix}-parent`,
		items: [items.monthlyPrice({ price: fromParentPrice })],
	});
	const toParent = products.base({
		id: `${idPrefix}-to`,
		group: `${idPrefix}-parent`,
		items: [items.monthlyPrice({ price: toParentPrice })],
	});
	const seat = products.base({
		id: `${idPrefix}-seat`,
		group: `${idPrefix}-seat`,
		items: [items.monthlyPrice({ price: SEAT_PRICE })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: assignedSeats, featureId: TestFeature.Users }),
			s.products({ list: [fromParent, toParent, seat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: fromParent.id,
				licenseProductId: seat.id,
				included: fromIncluded,
			}),
			s.licenses.link({
				parentProductId: toParent.id,
				licenseProductId: seat.id,
				included: toIncluded,
			}),
		],
	});

	await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: fromParent.id,
		license_quantities: [{ license_plan_id: seat.id, quantity: assignedSeats }],
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
	await expectLicenseUpdatePreviewCorrect({
		preview,
		customerId,
		advancedTo: scenario.advancedTo,
		oldRecurringTotal:
			fromParentPrice + Math.max(0, assignedSeats - fromIncluded) * SEAT_PRICE,
		newRecurringTotal: toParentPrice + expectedPaidSeats * SEAT_PRICE,
	});
	await scenario.autumnV2_3.billing.attach(params);

	const customer =
		await scenario.autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: seat.id,
				parent_plan_id: toParent.id,
				granted: toIncluded + expectedPaidSeats,
				usage: assignedSeats,
				remaining: toIncluded + expectedPaidSeats - assignedSeats,
				paid_quantity: expectedPaidSeats,
			},
		],
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});
};

test.concurrent(
	`${chalk.yellowBright("license transitions: included-seat increase removes paid seats")}`,
	async () => {
		await runIncludedSeatTransition({
			idPrefix: "included-increase",
			fromIncluded: 1,
			toIncluded: 10,
			assignedSeats: 2,
			expectedPaidSeats: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license transitions: included-seat decrease adds paid seats")}`,
	async () => {
		await runIncludedSeatTransition({
			idPrefix: "included-decrease",
			fromIncluded: 10,
			toIncluded: 3,
			assignedSeats: 5,
			expectedPaidSeats: 2,
		});
	},
);
