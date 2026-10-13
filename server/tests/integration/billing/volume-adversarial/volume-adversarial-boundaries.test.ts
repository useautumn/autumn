/**
 * Volume bands at their edges. 100 included with net tiers 0-500 @ $0.10 / 501+ @ $0.05
 * are total-usage bands 0-100 free, 101-600 @ $0.10, 601+ @ $0.05; only overage is billed.
 */

import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import {
	expectVolumeRenewalCorrect,
	setupVolumeConsumable,
} from "./utils/volumeAdversarialUtils";

const runBoundaryRenewal = async ({
	customerId,
	usage,
	expectedFeatureAmount,
}: {
	customerId: string;
	usage: number;
	expectedFeatureAmount: number;
}) => {
	const { scenario } = await setupVolumeConsumable({
		customerId,
		item: items.volumeConsumableMessages({ includedUsage: 100 }),
		usage,
	});
	await expectVolumeRenewalCorrect({ scenario, expectedFeatureAmount });
};

test.concurrent(
	`${chalk.yellowBright("volume-boundaries 1: included - 1 (99 used) → $0")}`,
	async () => {
		// 99 ≤ 100 included: nothing charged
		await runBoundaryRenewal({
			customerId: "vol-adv-bound-included-minus",
			usage: 99,
			expectedFeatureAmount: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-boundaries 2: exactly at included (100 used) → $0")}`,
	async () => {
		// 100 ≤ 100 included: nothing charged
		await runBoundaryRenewal({
			customerId: "vol-adv-bound-included",
			usage: 100,
			expectedFeatureAmount: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-boundaries 3: included + 1 (101 used) → only the 1 overage unit charged: $0.10")}`,
	async () => {
		// 101 used = 1 overage in band 101-600: 1 × $0.10 = $0.10
		await runBoundaryRenewal({
			customerId: "vol-adv-bound-included-plus",
			usage: 101,
			expectedFeatureAmount: 0.1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-boundaries 4: tier boundary - 1 (599 used) → 499 overage: $49.90")}`,
	async () => {
		// 599 used = 499 overage in band 101-600: 499 × $0.10 = $49.90
		await runBoundaryRenewal({
			customerId: "vol-adv-bound-tier-minus",
			usage: 599,
			expectedFeatureAmount: 49.9,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-boundaries 5: exactly on tier boundary (600 used) → 500 overage: $50.00")}`,
	async () => {
		// 600 is the last unit of band 101-600: 500 overage × $0.10 = $50
		await runBoundaryRenewal({
			customerId: "vol-adv-bound-tier",
			usage: 600,
			expectedFeatureAmount: 50,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-boundaries 6: tier boundary + 1 (601 used) → 501 overage: $25.05")}`,
	async () => {
		// 601 used = 501 overage in band 601+: 501 × $0.05 = $25.05
		await runBoundaryRenewal({
			customerId: "vol-adv-bound-tier-plus",
			usage: 601,
			expectedFeatureAmount: 25.05,
		});
	},
);
