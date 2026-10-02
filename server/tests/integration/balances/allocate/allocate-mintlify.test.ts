/**
 * The cases Mintlify asked for in their own shape: every site (entity) has a plan with pooled
 * monthly credits and, when overage is on, its own priced overage row; the pooled credits form one pot.
 *
 * Contract (PRD §4 rule 2, §11 core + interval + deduction paths):
 *   Kyle on:  10k pot, A=5k B=5k, A uses 8k → 5k from its share, 3k on A's own overage row; B keeps 5k.
 *   Kyle off: same, no overage → A stops at 5k; B keeps 5k.
 *   Credit system: a metered feature drawing from allocated credits is held to the share after conversion.
 *   One-off credits: never count toward the pot, but any entity can use them on top of its share.
 *   After an automatic cut: lowering a share works; raising past what's left is rejected.
 */

import { expect, test } from "bun:test";
import type { ApiBalanceV1 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	allocateMessages,
	autumnV2_3,
	expectAllocatedMessages,
	isMessagesAllowed,
	trackMessages,
	warmCaches,
} from "./utils/allocateTestUtils.js";
import { expectMessagesBalance } from "./utils/expectMessagesBalance.js";

type WithBalances = { balances: Record<string, ApiBalanceV1> };

const entityBalance = async ({
	customerId,
	entityId,
	featureId,
}: {
	customerId: string;
	entityId: string;
	featureId: string;
}) =>
	(await autumnV2_3.entities.get<WithBalances>(customerId, entityId)).balances[
		featureId
	];

const setupSites = async ({
	customerId,
	withOverage,
}: {
	customerId: string;
	withOverage: boolean;
}) => {
	const site = products.base({
		id: `${customerId}-site`,
		items: [
			{ ...items.monthlyMessages({ includedUsage: 5000 }), pooled: true },
			...(withOverage ? [items.consumableMessages({ price: 0.01 })] : []),
		],
	});
	const { entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [site] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: site.id, entityIndex: 0 }),
			s.billing.attach({ productId: site.id, entityIndex: 1 }),
		],
	});
	const entityIds = entities.map((entity) => entity.id);
	await warmCaches({ customerId, entityIds });
	return entityIds;
};

test.concurrent(
	`${chalk.yellowBright("allocate-mintlify1: Kyle with overage on — A's extra 3k is billed on A's own overage, B keeps 5k")}`,
	async () => {
		const customerId = "allocate-mintlify-1";
		const [a, b] = await setupSites({ customerId, withOverage: true });
		await allocateMessages({
			customerId,
			allocations: [
				{ entity_id: a, amount: 5000 },
				{ entity_id: b, amount: 5000 },
			],
		});

		await trackMessages({ customerId, entityId: a, value: 8000 });

		await pollUntilAsserted({
			fetch: () =>
				entityBalance({
					customerId,
					entityId: a,
					featureId: TestFeature.Messages,
				}),
			assert: (balance) => {
				expect(balance.usage).toBe(8000);
				const shared = balance.breakdown?.find((row) => row.allocation);
				const overage = balance.breakdown?.find(
					(row) => row.source === "entity",
				);
				expect(shared).toMatchObject({ usage: 5000, remaining: 0 });
				expect(overage?.usage).toBe(3000);
			},
		});
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: b,
			expected: { remaining: 5000 },
		});
		expect(
			await isMessagesAllowed({
				customerId,
				entityId: b,
				requiredBalance: 5000,
			}),
		).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-mintlify2: Kyle with overage off — A is blocked at 5k, B keeps 5k")}`,
	async () => {
		const customerId = "allocate-mintlify-2";
		const [a, b] = await setupSites({ customerId, withOverage: false });
		await allocateMessages({
			customerId,
			allocations: [
				{ entity_id: a, amount: 5000 },
				{ entity_id: b, amount: 5000 },
			],
		});

		await trackMessages({ customerId, entityId: a, value: 8000 });

		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: a,
			expected: { usage: 5000, remaining: 0 },
		});
		expect(
			await isMessagesAllowed({ customerId, entityId: a, requiredBalance: 1 }),
		).toBe(false);
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: b,
			expected: { remaining: 5000 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-mintlify3: a metered feature drawing from allocated credits is held to the share")}`,
	async () => {
		const customerId = "allocate-mintlify-3";
		const site = products.base({
			id: `${customerId}-site`,
			items: [
				{ ...items.monthlyCredits({ includedUsage: 500 }), pooled: true },
			],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [site] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: site.id, entityIndex: 0 }),
				s.billing.attach({ productId: site.id, entityIndex: 1 }),
			],
		});
		const [a, b] = entities.map((entity) => entity.id);
		await warmCaches({ customerId, entityIds: [a, b] });

		await autumnV2_3.customers.update(customerId, {
			billing_controls: {
				balance_allocations: [
					{
						feature_id: TestFeature.Credits,
						interval: ResetInterval.Month,
						allocations: [
							{ entity_id: a, amount: 600 },
							{ entity_id: b, amount: 400 },
						],
					},
				],
			},
		});

		// 4000 action1 × 0.2 = 800 credits wanted; A's share is 600.
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: a,
			feature_id: TestFeature.Action1,
			value: 4000,
		});

		await pollUntilAsserted({
			fetch: () =>
				entityBalance({
					customerId,
					entityId: a,
					featureId: TestFeature.Credits,
				}),
			assert: (balance) =>
				expect(balance).toMatchObject({
					granted: 600,
					usage: 600,
					remaining: 0,
				}),
		});
		await pollUntilAsserted({
			fetch: () =>
				entityBalance({
					customerId,
					entityId: b,
					featureId: TestFeature.Credits,
				}),
			assert: (balance) =>
				expect(balance).toMatchObject({ granted: 400, remaining: 400 }),
		});
		const check = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: a,
			feature_id: TestFeature.Action1,
			required_balance: 1,
		});
		expect(check.allowed).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-mintlify4: one-off credits don't count toward the pot but any entity can use them")}`,
	async () => {
		const customerId = "allocate-mintlify-4";
		const shared = products.base({
			id: `${customerId}-shared`,
			items: [items.monthlyMessages({ includedUsage: 10000 })],
		});
		const topUp = products.base({
			id: `${customerId}-topup`,
			isAddOn: true,
			items: [items.oneOffMessages({ billingUnits: 1, price: 0.01 })],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [shared, topUp] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: shared.id }),
				s.billing.attach({
					productId: topUp.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 2000 }],
				}),
			],
		});
		const [a, b] = entities.map((entity) => entity.id);
		await warmCaches({ customerId, entityIds: [a, b] });

		await expectAutumnError({
			errCode: "allocation_exceeds_available",
			func: () =>
				allocateMessages({
					customerId,
					allocations: [
						{ entity_id: a, amount: 6000 },
						{ entity_id: b, amount: 6000 },
					],
				}),
		});
		await allocateMessages({
			customerId,
			allocations: [
				{ entity_id: a, amount: 5000 },
				{ entity_id: b, amount: 5000 },
			],
		});

		await trackMessages({ customerId, entityId: a, value: 6000 });
		// A has its 5k share plus the 2k one-off; 1k of that one-off is left for anyone.
		expect(
			await isMessagesAllowed({
				customerId,
				entityId: a,
				requiredBalance: 1000,
			}),
		).toBe(true);
		expect(
			await isMessagesAllowed({
				customerId,
				entityId: a,
				requiredBalance: 1001,
			}),
		).toBe(false);
		expect(
			await isMessagesAllowed({
				customerId,
				entityId: b,
				requiredBalance: 6000,
			}),
		).toBe(true);
		expect(
			await isMessagesAllowed({
				customerId,
				entityId: b,
				requiredBalance: 6001,
			}),
		).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-mintlify5: after an automatic cut, lowering works and raising past what's left is rejected")}`,
	async () => {
		const customerId = "allocate-mintlify-5";
		const base = products.base({
			id: `${customerId}-base`,
			items: [items.monthlyMessages({ includedUsage: 6000 })],
		});
		const addOn = products.base({
			id: `${customerId}-addon`,
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 4000 })],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [base, addOn] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: base.id }),
				s.billing.attach({ productId: addOn.id }),
			],
		});
		const [a, b] = entities.map((entity) => entity.id);
		await allocateMessages({
			customerId,
			allocations: [
				{ entity_id: a, amount: 5000 },
				{ entity_id: b, amount: 5000 },
			],
		});
		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			plan_id: addOn.id,
			cancel_action: "cancel_immediately",
		});
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: a,
			expected: { granted: 3000 },
		});

		const lowered = await allocateMessages({
			customerId,
			allocations: [
				{ entity_id: a, amount: 1000 },
				{ entity_id: b, amount: 5000 },
			],
		});
		await expectAllocatedMessages({
			customerId,
			response: lowered,
			expected: [
				{
					entity_id: a,
					amount: 1000,
					granted: 1000,
				},
				{
					entity_id: b,
					amount: 5000,
					granted: 5000,
					usage: 0,
					remaining: 5000,
				},
			],
		});

		await expectAutumnError({
			errCode: "allocation_exceeds_available",
			func: () =>
				allocateMessages({
					customerId,
					allocations: [
						{ entity_id: a, amount: 5000 },
						{ entity_id: b, amount: 5000 },
					],
				}),
		});
	},
);
