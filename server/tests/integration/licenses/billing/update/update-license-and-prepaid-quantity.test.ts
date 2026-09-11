/**
 * Combined license_quantities + parent prepaid feature_quantities on billing.update.
 *
 * Prepaid lives on the root plan, not the license plan, so both params may be
 * sent together. Per-seat included grants of the same feature stay on seats.
 *
 * Red (current): 400 "license_quantities cannot be combined with feature_quantities"
 * Green (after): seats and parent prepaid both apply; one invoice with both
 * deltas; shrinking below assignments still 400; one-off prepaid + seats
 * stays "Cannot update a one-off prepaid quantity alongside other subscription changes".
 */

import { test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	BillingMethod,
	type ProductItem,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { expectLicenseUpdatePreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectCustomerProductOptions } from "@tests/integration/utils/expectCustomerProductOptions";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";

const SEAT_PRICE = 20;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const NEW_SEATS = 5;
const PARENT_BASE_PRICE = 20;
const PREPAID_BILLING_UNITS = 20000;
const PREPAID_PACK_PRICE = 10;
const ATTACHED_PREPAID = 40000;
const NEW_PREPAID = 80000;
const ATTACHED_PREPAID_PACKS = ATTACHED_PREPAID / PREPAID_BILLING_UNITS;
const NEW_PREPAID_PACKS = NEW_PREPAID / PREPAID_BILLING_UNITS;
const ATTACHED_PAID_SEATS = ATTACHED_SEATS - INCLUDED_SEATS;
const NEW_PAID_SEATS = NEW_SEATS - INCLUDED_SEATS;

const oldRecurringTotal =
	PARENT_BASE_PRICE +
	ATTACHED_PAID_SEATS * SEAT_PRICE +
	ATTACHED_PREPAID_PACKS * PREPAID_PACK_PRICE;
const newRecurringTotal =
	PARENT_BASE_PRICE +
	NEW_PAID_SEATS * SEAT_PRICE +
	NEW_PREPAID_PACKS * PREPAID_PACK_PRICE;

const setupParentPrepaidAndSeats = ({
	customerId,
	idPrefix,
	parentItems,
	attachOptions,
}: {
	customerId: string;
	idPrefix: string;
	parentItems: ProductItem[];
	attachOptions: { feature_id: string; quantity: number }[];
}) =>
	setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		pricedParent: true,
		parentItems,
		attachOptions,
		seatPrice: SEAT_PRICE,
		seatItems: [items.monthlyMessages({ includedUsage: 1000 })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});

test.concurrent(
	`${chalk.yellowBright("license-update-prepaid: grow seats and parent prepaid in one update")}`,
	async () => {
		const customerId = "license-update-prepaid-grow";
		const { ctx, autumnV1, autumnV2_4, parent, devSeat, advancedTo } =
			await setupParentPrepaidAndSeats({
				customerId,
				idPrefix: "lic-qty-prepaid-grow",
				parentItems: [
					items.prepaidMessages({
						billingUnits: PREPAID_BILLING_UNITS,
						price: PREPAID_PACK_PRICE,
					}),
				],
				attachOptions: [
					{ feature_id: TestFeature.Messages, quantity: ATTACHED_PREPAID },
				],
			});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [
				{ license_plan_id: devSeat.id, quantity: NEW_SEATS },
			],
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: NEW_PREPAID },
			],
		};

		const preview =
			await autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo,
			oldRecurringTotal,
			newRecurringTotal,
			expectLineItemCount: 4,
		});

		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		const customer = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: devSeat.id,
					parent_plan_id: parent.id,
					granted: NEW_SEATS,
					usage: 0,
					remaining: NEW_SEATS,
					paid_quantity: NEW_PAID_SEATS,
				},
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: TestFeature.Messages,
			granted: NEW_PREPAID,
			remaining: NEW_PREPAID,
			breakdown: {
				[BillingMethod.Prepaid]: {
					prepaid_grant: NEW_PREPAID,
					remaining: NEW_PREPAID,
				},
			},
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: parent.id,
			featureId: TestFeature.Messages,
			quantity: NEW_PREPAID_PACKS,
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: newRecurringTotal - oldRecurringTotal,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("license-update-prepaid: combined update still rejects shrinking below assignments")}`,
	async () => {
		const customerId = "license-update-prepaid-below";
		const { autumnV2_4, parent, devSeat, assignSeats } =
			await setupParentPrepaidAndSeats({
				customerId,
				idPrefix: "lic-qty-prepaid-below",
				parentItems: [
					items.prepaidMessages({
						billingUnits: PREPAID_BILLING_UNITS,
						price: PREPAID_PACK_PRICE,
					}),
				],
				attachOptions: [
					{ feature_id: TestFeature.Messages, quantity: ATTACHED_PREPAID },
				],
			});

		await assignSeats({ count: 2 });

		await expectAutumnError({
			errMessage: "Release licenses first",
			func: () =>
				autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
					customer_id: customerId,
					plan_id: parent.id,
					license_quantities: [{ license_plan_id: devSeat.id, quantity: 1 }],
					feature_quantities: [
						{ feature_id: TestFeature.Messages, quantity: NEW_PREPAID },
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license-update-prepaid: one-off prepaid cannot ride with license_quantities")}`,
	async () => {
		const customerId = "license-update-prepaid-oneoff";
		const { autumnV2_4, parent, devSeat } = await setupLicenseUpdateScenario({
			customerId,
			idPrefix: "lic-qty-prepaid-oneoff",
			pricedParent: true,
			parentItems: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
			attachOptions: [
				{ feature_id: TestFeature.Messages, quantity: 100 },
			],
			seatPrice: SEAT_PRICE,
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});

		await expectAutumnError({
			errMessage:
				"Cannot update a one-off prepaid quantity alongside other subscription changes",
			func: () =>
				autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
					customer_id: customerId,
					plan_id: parent.id,
					license_quantities: [
						{ license_plan_id: devSeat.id, quantity: NEW_SEATS },
					],
					feature_quantities: [
						{ feature_id: TestFeature.Messages, quantity: 200 },
					],
				}),
		});
	},
);
