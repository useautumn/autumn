/** Pooled license replacements reset the shared balance by default and carry
 * aggregate usage only when carry_over_usages enables the feature. */
import { test } from "bun:test";
import { EntInterval, PooledBalanceResetMode } from "@autumn/shared";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect";
import { getPooledBalanceDbState } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import {
	completeImmediateItemTransition,
	ITEM_TRANSITION_ENTITY_COUNT,
	ITEM_TRANSITION_ENTITY_USAGES,
	setupItemTransitionScenario,
} from "../../utils/itemTransitionTestUtils";

const FROM_GRANT = 100;
const TO_GRANT = 500;
const TOTAL_USAGE = ITEM_TRANSITION_ENTITY_USAGES.reduce(
	(total, usage) => total + usage,
	0,
);

const pooledMessages = ({ grant }: { grant: number }) => ({
	...items.monthlyMessages({ includedUsage: grant }),
	pooled: true,
});

const runPooledTransition = async ({
	idPrefix,
	carryOverUsages,
	expectUsageCarried,
}: {
	idPrefix: string;
	carryOverUsages?: { enabled: boolean; feature_ids?: string[] };
	expectUsageCarried: boolean;
}) => {
	const scenario = await setupItemTransitionScenario({
		idPrefix,
		fromItems: [pooledMessages({ grant: FROM_GRANT })],
		toItems: [pooledMessages({ grant: TO_GRANT })],
		trackedFeatureIds: [TestFeature.Messages],
	});

	await completeImmediateItemTransition({ scenario, carryOverUsages });

	const totalGrant = TO_GRANT * ITEM_TRANSITION_ENTITY_COUNT;
	const state = await getPooledBalanceDbState({
		db: scenario.ctx.db,
		customerId: scenario.customerId,
	});
	const livePool = state.pools.find((pool) => pool.expires_at === null);
	if (!livePool) throw new Error("Expected a live pooled license balance");
	await expectPooledBalanceCorrect({
		db: scenario.ctx.db,
		customerId: scenario.customerId,
		pool: {
			balance: expectUsageCarried ? totalGrant - TOTAL_USAGE : totalGrant,
			adjustment: 0,
			granted: totalGrant,
			interval: EntInterval.Month,
			nextResetAt: "present",
			resetCycleAnchor: "present",
			resetMode: PooledBalanceResetMode.Lazy,
			stripeSubscriptionId: null,
			customerLicenseLinkId: livePool.customer_license_link_id,
		},
		contributions: {
			count: ITEM_TRANSITION_ENTITY_COUNT,
			currentContribution: TO_GRANT,
			nextCycleContribution: TO_GRANT,
		},
		sources: {
			count: ITEM_TRANSITION_ENTITY_COUNT,
			balance: 0,
			adjustment: 0,
		},
	});
};

test.concurrent(
	`${chalk.yellowBright("pooled license transition: resets shared usage by default")}`,
	async () => {
		await runPooledTransition({
			idPrefix: "license-pooled-reset",
			expectUsageCarried: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled license transition: carries shared usage when enabled")}`,
	async () => {
		await runPooledTransition({
			idPrefix: "license-pooled-carry",
			carryOverUsages: { enabled: true },
			expectUsageCarried: true,
		});
	},
);
