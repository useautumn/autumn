import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	CustomerExpand,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const BASE_PRICE = 20;
const PRICE_PER_SEAT = 10;
const INCLUDED_SEATS = 1;
const SEATS = 3;

type Scenario = Awaited<ReturnType<typeof setupAllocatedSeats>>;

/** $20 base + linear allocated seats ($10/seat, 1 included, deletes free a seat at renewal). */
const setupAllocatedSeats = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		id: customerId,
		items: [items.allocatedUsers({ includedUsage: INCLUDED_SEATS })],
	});

	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: SEATS, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ weeks: 2 }),
		],
	});
};

const getInvoicePreview = async ({ scenario }: { scenario: Scenario }) => {
	const { invoice_previews } =
		await scenario.autumnV2_2.customers.get<ApiCustomerV5>(
			scenario.customerId,
			{ expand: [CustomerExpand.InvoicePreviews] },
		);
	expect(invoice_previews).toHaveLength(1);
	return invoice_previews![0];
};

const seatSubtotal = ({
	preview,
}: {
	preview: Awaited<ReturnType<typeof getInvoicePreview>>;
}) =>
	preview.line_items
		.filter((lineItem) => lineItem.feature_id === TestFeature.Users)
		.reduce((sum, lineItem) => sum + lineItem.subtotal, 0);

const getRenewalInvoice = async ({ scenario }: { scenario: Scenario }) => {
	await advanceToNextInvoice({
		stripeCli: scenario.ctx.stripeCli,
		testClockId: scenario.testClockId!,
		withPause: true,
	});

	const customer = await scenario.autumnV1.customers.get<ApiCustomerV3>(
		scenario.customerId,
	);
	return customer.invoices![0];
};

test.concurrent(
	`${chalk.yellowBright("invoice-previews-allocated 1: a seat deleted mid-cycle drops from the next-cycle preview, which matches the renewal invoice")}`,
	async () => {
		const scenario = await setupAllocatedSeats({
			customerId: "inv-previews-allocated-delete",
		});

		await scenario.autumnV1.entities.delete(
			scenario.customerId,
			scenario.entities[0].id,
		);
		await timeout(3000);
		await expectBalanceCorrect({
			customerId: scenario.customerId,
			featureId: TestFeature.Users,
			usage: SEATS - 1,
		});

		// 2 seats renew, 1 included: 1 × $10
		const preview = await getInvoicePreview({ scenario });
		expect(seatSubtotal({ preview })).toBeCloseTo(PRICE_PER_SEAT, 2);
		expect(preview.total).toBeCloseTo(BASE_PRICE + PRICE_PER_SEAT, 2);

		const renewalInvoice = await getRenewalInvoice({ scenario });
		expect(renewalInvoice.total).toBeCloseTo(preview.total, 2);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice-previews-allocated 2: with no deletes the preview bills every held seat and matches the renewal invoice")}`,
	async () => {
		const scenario = await setupAllocatedSeats({
			customerId: "inv-previews-allocated-no-delete",
		});

		// 3 seats renew, 1 included: 2 × $10
		const preview = await getInvoicePreview({ scenario });
		expect(seatSubtotal({ preview })).toBeCloseTo(2 * PRICE_PER_SEAT, 2);
		expect(preview.total).toBeCloseTo(BASE_PRICE + 2 * PRICE_PER_SEAT, 2);

		const renewalInvoice = await getRenewalInvoice({ scenario });
		expect(renewalInvoice.total).toBeCloseTo(preview.total, 2);
	},
);
