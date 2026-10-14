import { expect, test } from "bun:test";
import type { ApiCustomerV3, LimitedItem } from "@autumn/shared";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import {
	expectVolumeRenewalCorrect,
	setupVolumeConsumable,
} from "./utils/volumeAdversarialUtils";

const INCLUDED = 100;
const USAGE = 800;

const runTierBehaviorMigration = async ({
	customerId,
	fromItem,
	toItem,
	expectedFeatureAmount,
}: {
	customerId: string;
	fromItem: LimitedItem;
	toItem: LimitedItem;
	expectedFeatureAmount: number;
}) => {
	const { scenario, pro } = await setupVolumeConsumable({
		customerId,
		item: fromItem,
		usage: USAGE,
	});
	const { autumnV1, autumnV2_2, ctx } = scenario;

	await autumnV1.products.update(pro.id, {
		items: [items.monthlyPrice({ price: 20 }), toItem],
	});
	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{ type: "update_plan", plan_filter: { plan_id: pro.id }, version: 2 },
			],
		},
		runOnServer: false,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.products?.find((p) => p.id === pro.id)?.version).toBe(2);
	expect(customer.invoices).toHaveLength(1);
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		usage: USAGE,
	});

	await expectVolumeRenewalCorrect({ scenario, expectedFeatureAmount });
};

test.concurrent(
	`${chalk.yellowBright("volume-migration 1: graduated → volume via update_plan: 800 used bills $35, not $60")}`,
	async () => {
		await runTierBehaviorMigration({
			customerId: "vol-adv-mig-grad-to-vol",
			fromItem: items.tieredConsumableMessages({ includedUsage: INCLUDED }),
			toItem: items.volumeConsumableMessages({ includedUsage: INCLUDED }),
			expectedFeatureAmount: 35,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-migration 2: volume → graduated via update_plan: 800 used bills $60, not $35")}`,
	async () => {
		await runTierBehaviorMigration({
			customerId: "vol-adv-mig-vol-to-grad",
			fromItem: items.volumeConsumableMessages({ includedUsage: INCLUDED }),
			toItem: items.tieredConsumableMessages({ includedUsage: INCLUDED }),
			expectedFeatureAmount: 60,
		});
	},
);
