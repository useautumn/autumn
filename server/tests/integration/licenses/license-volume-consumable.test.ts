/**
 * Pay-per-use volume items around license (seat) plans. Seat assignments never bill
 * usage (initCustomerEntitlementUsageAllowed), so a seat's volume item caps at its
 * included amount; the parent plan's volume item bills on its band as usual.
 * Each case checks the upcoming-invoice preview equals the renewal invoice.
 */

import { expect, test } from "bun:test";
import type { ProductItem } from "@autumn/shared";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const setupLicenseVolume = async ({
	customerId,
	parentItems,
	seatItems,
	usage,
}: {
	customerId: string;
	parentItems: ProductItem[];
	seatItems: ProductItem[];
	usage: { value: number; entityIndex?: number }[];
}) => {
	const parent = products.pro({
		id: `${customerId}-parent`,
		items: [items.dashboard(), ...parentItems],
	});
	const seat = products.base({
		id: `${customerId}-seat`,
		items: seatItems,
		group: `${customerId}-seats`,
	});

	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [parent, seat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: seat.id,
				included: 2,
			}),
			s.billing.attach({ productId: parent.id }),
			s.licenses.assign({ licenseProductId: seat.id, entityIndexes: [0, 1] }),
			...usage.map(({ value, entityIndex }) =>
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

// Default tiers: 0-500 @ $0.10, 501+ @ $0.05, net of 100 included → total bands 0-600 / 601+.
test.concurrent(
	`${chalk.yellowBright("license-volume-consumable 1: volume item on a seat plan never bills usage")}`,
	async () => {
		const customerId = "license-vol-seat";
		const scenario = await setupLicenseVolume({
			customerId,
			parentItems: [],
			seatItems: [items.volumeConsumableMessages({ includedUsage: 100 })],
			usage: [
				{ value: 150, entityIndex: 0 },
				{ value: 700, entityIndex: 1 },
			],
		});

		// Seat usage is capped at included and never billed: $0 messages
		const { preview } = await expectNextInvoiceMatchesPreview({
			ctx: scenario.ctx,
			autumnV1: scenario.autumnV1,
			autumnV2_2: scenario.autumnV2_2,
			customerId,
			testClockId: scenario.testClockId!,
			advancedTo: scenario.advancedTo,
			featureId: TestFeature.Messages,
			expectedFeatureAmount: 0,
		});
		// $20 parent base only
		expect(preview.total).toBeCloseTo(20, 2);
	},
);

test.concurrent(
	`${chalk.yellowBright("license-volume-consumable 2: volume item on a license parent bills on its band")}`,
	async () => {
		const customerId = "license-vol-parent";
		const scenario = await setupLicenseVolume({
			customerId,
			parentItems: [items.volumeConsumableMessages({ includedUsage: 100 })],
			seatItems: [items.monthlyWords({ includedUsage: 10 })],
			usage: [{ value: 700 }],
		});

		// 700 > 600 (band 2): 700 × $0.05 = $35
		const { preview } = await expectNextInvoiceMatchesPreview({
			ctx: scenario.ctx,
			autumnV1: scenario.autumnV1,
			autumnV2_2: scenario.autumnV2_2,
			customerId,
			testClockId: scenario.testClockId!,
			advancedTo: scenario.advancedTo,
			featureId: TestFeature.Messages,
			expectedFeatureAmount: 35,
		});
		// $20 parent base + $35 usage
		expect(preview.total).toBeCloseTo(55, 2);
	},
);
