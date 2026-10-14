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

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

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

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 160,
			usage: 40,
		});
	},
);

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
