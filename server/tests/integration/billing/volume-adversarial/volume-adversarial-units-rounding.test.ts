import { expect, test } from "bun:test";
import type { LimitedItem } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import type Stripe from "stripe";
import {
	expectVolumeRenewalCorrect,
	setupVolumeConsumable,
} from "./utils/volumeAdversarialUtils";

const packItem = ({ includedUsage = 0 }: { includedUsage?: number } = {}) =>
	items.volumeConsumableMessages({
		includedUsage,
		billingUnits: 100,
		tiers: [
			{ to: 500, amount: 5 },
			{ to: "inf", amount: 3 },
		],
	});

const subCentItem = () =>
	items.volumeConsumableMessages({
		tiers: [
			{ to: 1000, amount: 0.0033 },
			{ to: "inf", amount: 0.0021 },
		],
	});

const autumnLineCents = (stripeLines: Stripe.InvoiceLineItem[]) =>
	stripeLines
		.filter((line) => line.metadata?.autumn_line_item_id)
		.reduce((sum, line) => sum + line.amount, 0);

const runRenewal = async ({
	customerId,
	item,
	usage,
	expectedCents,
	exactAmount = expectedCents / 100,
}: {
	customerId: string;
	item: LimitedItem;
	usage: number;
	expectedCents: number;
	exactAmount?: number;
}) => {
	const { scenario } = await setupVolumeConsumable({ customerId, item, usage });
	const { stripeLines } = await expectVolumeRenewalCorrect({
		scenario,
		expectedFeatureAmount: exactAmount,
	});
	expect(autumnLineCents(stripeLines)).toBe(expectedCents);
};

test.concurrent(
	`${chalk.yellowBright("volume-units-rounding 1: 450 used, 100/pack → 5 packs in band 1: $25")}`,
	async () => {
		await runRenewal({
			customerId: "vol-adv-units-band1",
			item: packItem(),
			usage: 450,
			expectedCents: 2500,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-units-rounding 2: 501 used, 100/pack → 6 packs in band 2: $18")}`,
	async () => {
		await runRenewal({
			customerId: "vol-adv-units-band2",
			item: packItem(),
			usage: 501,
			expectedCents: 1800,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-units-rounding 3: 50 included, 51 used, 100/pack → 1 overage pack in band 1: $5")}`,
	async () => {
		await runRenewal({
			customerId: "vol-adv-units-included",
			item: packItem({ includedUsage: 50 }),
			usage: 51,
			expectedCents: 500,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-units-rounding 4: $0.0033/unit, 777 used → $2.5641 bills 256 cents")}`,
	async () => {
		await runRenewal({
			customerId: "vol-adv-subcent-band1",
			item: subCentItem(),
			usage: 777,
			expectedCents: 256,
			exactAmount: 2.5641,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-units-rounding 5: $0.0021/unit, 1250 used → $2.625 bills 263 cents (half up)")}`,
	async () => {
		await runRenewal({
			customerId: "vol-adv-subcent-half",
			item: subCentItem(),
			usage: 1250,
			expectedCents: 263,
			exactAmount: 2.625,
		});
	},
);
