/**
 * Carry Over Usages - Cross-Group Tests
 *
 * carry_over_usages carries from the single same-group product being replaced.
 * When there is NO same-group product, but the attach expires a DIFFERENT-group
 * plan via remove_plan_ids, that removed plan becomes the carry-over source.
 *
 * Key behaviors:
 * - One removed cross-group plan → its usage carries onto the attached plan.
 * - Two removed plans that both hold usage → ambiguous (no merge rule), so the
 *   attach is rejected with InvalidRequest.
 */

import { test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	ErrCode,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Usage carries from a removed cross-group plan
//
// Old plan (group "legacy"): 50 messages, 40 used (balance=10)
// Attach New plan (group "current", 200 messages) with
//   carry_over_usages: { enabled: true } and remove_plan_ids: [old]
// Expected: New plan active, old plan gone, balance = 160 (200 - 40), usage = 40
// Before the fix: balance = 200 (removed plan is never a carry source cross-group)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("carry-over-usage cross-group 1: usage carries from a removed different-group plan")}`,
	async () => {
		const oldMessages = items.monthlyMessages({ includedUsage: 50 });
		const newMessages = items.monthlyMessages({ includedUsage: 200 });

		const oldPlan = products.base({
			id: "old-plan",
			group: "legacy",
			items: [oldMessages],
		});
		const newPlan = products.base({
			id: "new-plan",
			group: "current",
			items: [newMessages],
		});

		const { customerId, autumnV2_1, autumnV2_2, autumnV1 } = await initScenario(
			{
				customerId: "carry-over-usage-cross-group-1",
				setup: [s.customer({}), s.products({ list: [oldPlan, newPlan] })],
				actions: [s.attach({ productId: oldPlan.id, timeout: 4000 })],
			},
		);

		// Track 40 units on the old plan (balance: 50 → 10)
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Attach the new plan, expiring the old (different-group) plan in the same go
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: newPlan.id,
			carry_over_usages: { enabled: true },
			remove_plan_ids: [oldPlan.id],
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [newPlan.id],
			notPresent: [oldPlan.id],
		});

		// Balance = 200 (new allowance) - 40 (carried usage) = 160
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 160,
			usage: 40,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Two carryable removed plans is ambiguous → InvalidRequest
//
// Two active plans in different groups, both holding usage. Attaching a third
// plan that removes BOTH has no single carry source and no merge rule.
// Expected: InvalidRequest.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("carry-over-usage cross-group 2: two carryable removed plans throws InvalidRequest")}`,
	async () => {
		const messagesA = items.monthlyMessages({ includedUsage: 50 });
		const messagesB = items.monthlyMessages({ includedUsage: 50 });
		const newMessages = items.monthlyMessages({ includedUsage: 200 });

		const oldPlanA = products.base({
			id: "old-plan-a",
			group: "group-a",
			items: [messagesA],
		});
		const oldPlanB = products.base({
			id: "old-plan-b",
			group: "group-b",
			items: [messagesB],
		});
		const newPlan = products.base({
			id: "new-plan",
			group: "current",
			items: [newMessages],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "carry-over-usage-cross-group-2",
			setup: [
				s.customer({}),
				s.products({ list: [oldPlanA, oldPlanB, newPlan] }),
			],
			actions: [
				s.attach({ productId: oldPlanA.id, timeout: 4000 }),
				s.attach({ productId: oldPlanB.id, timeout: 4000 }),
			],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: newPlan.id,
					carry_over_usages: { enabled: true },
					remove_plan_ids: [oldPlanA.id, oldPlanB.id],
				}),
		});
	},
);
