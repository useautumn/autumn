import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import {
	expectVolumeRenewalCorrect,
	setupVolumeConsumable,
} from "./utils/volumeAdversarialUtils";

test.concurrent(
	`${chalk.yellowBright("volume-infinite-tier 1: 1,000,000 used → infinite tier: 1,000,000 × $0.002 + $5 = $2,005")}`,
	async () => {
		const { scenario } = await setupVolumeConsumable({
			customerId: "vol-adv-infinite-tier",
			item: items.volumeConsumableMessages({
				tiers: [
					{ to: 500, amount: 0.1 },
					{ to: 10_000, amount: 0.05 },
					{ to: "inf", amount: 0.002, flat_amount: 5 },
				],
			}),
			usage: 1_000_000,
		});

		const { renewalInvoice } = await expectVolumeRenewalCorrect({
			scenario,
			expectedFeatureAmount: 2005,
		});
		expect(renewalInvoice.total).toBeCloseTo(2025, 2);
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-infinite-tier 2: 100 included, 1,000,000 used → 999,900 overage in band 601+: $49,995")}`,
	async () => {
		const { scenario } = await setupVolumeConsumable({
			customerId: "vol-adv-infinite-included",
			item: items.volumeConsumableMessages({ includedUsage: 100 }),
			usage: 1_000_000,
		});

		await expectVolumeRenewalCorrect({
			scenario,
			expectedFeatureAmount: 49_995,
		});
	},
);
