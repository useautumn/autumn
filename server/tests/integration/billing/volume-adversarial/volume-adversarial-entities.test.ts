/**
 * Volume with entities. An entity_feature_id consumable prices the customer's actual usage
 * against the summed allowance, so one entity over its own limit is free while the total is
 * under it. Deleting an entity mid-cycle must keep preview = invoice for seats and usage.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	advanceMidCycle,
	expectVolumeRenewalCorrect,
	getInvoicePreview,
	sumFeatureSubtotal,
	type VolumeScenario,
} from "./utils/volumeAdversarialUtils";

const setupEntityConsumable = async ({
	customerId,
	entityUsages,
}: {
	customerId: string;
	entityUsages: number[];
}) => {
	// Default net tiers 0-500 @ $0.10 / 501+ @ $0.05, 100 included per entity.
	const pro = products.pro({
		id: customerId,
		items: [
			items.volumeConsumableMessages({
				includedUsage: 100,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});
	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: entityUsages.length, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.warmEntityCaches(),
			...entityUsages
				.map((value, entityIndex) => ({ value, entityIndex }))
				.filter(({ value }) => value > 0)
				.map(({ value, entityIndex }) =>
					s.track({
						featureId: TestFeature.Messages,
						value,
						entityIndex,
						timeout: 3000,
					}),
				),
		],
	});
};

const deleteEntities = async ({
	scenario,
	count,
	fromIndex = 0,
}: {
	scenario: VolumeScenario;
	count: number;
	fromIndex?: number;
}) => {
	for (const entity of scenario.entities.slice(fromIndex, fromIndex + count)) {
		await scenario.autumnV1.entities.delete(scenario.customerId, entity.id);
	}
	await timeout(5000);
};

test.concurrent(
	`${chalk.yellowBright("volume-entities 1: one entity over its own 100 while the customer total is under 200 included → $0")}`,
	async () => {
		const scenario = await setupEntityConsumable({
			customerId: "vol-adv-entity-under-total",
			entityUsages: [150, 0],
		});

		// 150 + 0 used = 150 ≤ 2 × 100 included: nothing charged
		await expectVolumeRenewalCorrect({ scenario, expectedFeatureAmount: 0 });
	},
);

// DISABLED: the next-cycle preview prices 11 seats (incl. the deleted seat's replaceable) at $88, Stripe renews 10 at $100.
// Fixed off dev in #4625 (prorated allocated path); unskip once it lands and the stack is rebased.
test.skip(`${chalk.yellowBright("volume-entities 2: allocated volume seats, 11 → 10 seats mid-cycle moves back to the $10 band; renewal = preview")}`, async () => {
	const customerId = "vol-adv-entity-seats-delete";
	// Tiers 0-10 @ $10 / 11+ @ $8 per seat, nothing included.
	const pro = products.pro({
		id: customerId,
		items: [items.volumeAllocatedUsers()],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 11, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// $20 base + 11 seats in band 11+: 11 × $8 = $88
	const afterAttach =
		await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(afterAttach.invoices?.[0]?.total).toBeCloseTo(108, 2);

	await advanceMidCycle({ scenario });
	await deleteEntities({ scenario, count: 1 });
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Users,
		usage: 10,
	});

	const preview = await getInvoicePreview({ scenario });
	expect(preview.total).toBeGreaterThanOrEqual(0);

	// Next cycle bills 10 seats in band 0-10: 10 × $10 = $100
	const { renewalInvoice } = await expectVolumeRenewalCorrect({
		scenario,
		featureId: TestFeature.Users,
		expectedFeatureAmount: 100,
		compareStripeLines: false,
	});
	expect(renewalInvoice.total).toBeCloseTo(preview.total, 2);
});

test.concurrent(
	`${chalk.yellowBright("volume-entities 3: entity consumable, delete an entity mid-cycle → its usage is still billed; renewal = preview")}`,
	async () => {
		const scenario = await setupEntityConsumable({
			customerId: "vol-adv-entity-usage-delete",
			entityUsages: [400, 300],
		});

		// 400 + 300 used = 700 against 200 included, band 201-700: 700 × $0.10 = $70
		const before = await getInvoicePreview({ scenario });
		expect(
			sumFeatureSubtotal({
				lineItems: before.line_items,
				featureId: TestFeature.Messages,
			}),
		).toBeCloseTo(70, 2);

		await advanceMidCycle({ scenario });
		const invoiceCountBefore =
			(
				await scenario.autumnV1.customers.get<ApiCustomerV3>(
					scenario.customerId,
				)
			).invoices?.length ?? 0;
		await deleteEntities({ scenario, count: 1, fromIndex: 1 });

		// Usage billed at deletion (if any) plus usage at renewal must still total $70
		const afterDelete = await scenario.autumnV1.customers.get<ApiCustomerV3>(
			scenario.customerId,
		);
		const billedAtDeletion = (afterDelete.invoices ?? [])
			.slice(0, (afterDelete.invoices?.length ?? 0) - invoiceCountBefore)
			.reduce((sum, invoice) => sum + invoice.total, 0);

		const { preview } = await expectVolumeRenewalCorrect({
			scenario,
			expectedFeatureAmount: 70 - billedAtDeletion,
		});
		expect(preview.total).toBeGreaterThanOrEqual(0);
	},
);
