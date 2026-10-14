import { test } from "bun:test";
import type { ApiEntityV2, MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectMultiUpdatePreviewCorrect } from "@tests/integration/billing/multi-update/utils/expectMultiUpdatePreviewCorrect";
import { initTwoEntityPremiumScenario } from "@tests/integration/billing/multi-update/utils/initTwoEntityPremiumScenario";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("multi update entity schedules: downgrade then cancel EOC both entities")}`,
	async () => {
		const customerId = "multi-update-ent-sched-eoc";

		const { autumnV2_3, ctx, entities, testClockId, premium, pro } =
			await initTwoEntityPremiumScenario({
				customerId,
				withEntity1Downgrade: true,
			});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{
					plan_id: premium.id,
					entity_id: entities[0].id,
					cancel_action: "cancel_end_of_cycle",
				},
				{
					plan_id: premium.id,
					entity_id: entities[1].id,
					cancel_action: "cancel_end_of_cycle",
				},
			],
		};

		await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: 0,
			subscriptions: [{ planIds: [premium.id], total: 0, nextCycleTotal: 0 }],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>(
			multiUpdateParams,
		);

		const entity1 = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		await expectProductCanceling({ customer: entity1, productId: premium.id });
		await expectProductNotPresent({ customer: entity1, productId: pro.id });

		const entity2 = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		await expectProductCanceling({ customer: entity2, productId: premium.id });

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1, shouldBeCanceling: true },
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		for (const entity of [entities[0], entities[1]]) {
			const entityAfterAdvance = await autumnV2_3.entities.get<ApiEntityV2>(
				customerId,
				entity.id,
			);
			await expectProductNotPresent({
				customer: entityAfterAdvance,
				productId: premium.id,
			});
		}

		await expectCustomerInvoiceCorrect({ customerId, count: 2 });

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update entity schedules: downgrade then cancel immediately both entities")}`,
	async () => {
		const customerId = "multi-update-ent-sched-imm";

		const { autumnV2_3, ctx, entities, premium, pro } =
			await initTwoEntityPremiumScenario({
				customerId,
				withEntity1Downgrade: true,
			});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{
					plan_id: premium.id,
					entity_id: entities[0].id,
					cancel_action: "cancel_immediately",
				},
				{
					plan_id: premium.id,
					entity_id: entities[1].id,
					cancel_action: "cancel_immediately",
				},
			],
		};

		const preview = await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: -100,
			subscriptions: [
				{ planIds: [premium.id], total: -100, nextCycleTotal: null },
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>(
			multiUpdateParams,
		);

		for (const entity of [entities[0], entities[1]]) {
			const entityAfterCancel = await autumnV2_3.entities.get<ApiEntityV2>(
				customerId,
				entity.id,
			);
			await expectProductNotPresent({
				customer: entityAfterCancel,
				productId: premium.id,
			});
			await expectProductNotPresent({
				customer: entityAfterCancel,
				productId: pro.id,
			});
		}

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: preview.total,
			latestInvoiceProductId: premium.id,
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
