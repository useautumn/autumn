/**
 * Ingress plan-id aliases on CORE billing endpoints.
 *
 * Sending the old id after `pro → proNew` must succeed and land on proNew.
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	type CreateScheduleParamsV0Input,
	type MultiUpdateParamsV0Input,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	collectResponsePlanIds,
	deleteAliases,
	renamePlan,
} from "../utils/planAliasTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("plan aliases billing: attach / preview_attach / remove_plan_ids / legacy attach")}`,
	async () => {
		const customerId = uniqueTestId("alias_att");
		const otherId = uniqueTestId("alias_att_b");
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.dashboard()],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
				s.otherCustomers([{ id: otherId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		const proOld = pro.id;
		const proNew = `${proOld}_n`;
		const addonOld = addon.id;
		const addonNew = `${addonOld}_n`;
		const planIds = [proOld, proNew, addonOld, addonNew];

		await deleteAliases({ ctx, planIds });
		try {
			await renamePlan({ autumn: autumnV2_3, fromId: proOld, toId: proNew });
			await renamePlan({ autumn: autumnV2_3, fromId: addonOld, toId: addonNew });

			const preview = await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(
				{
					customer_id: customerId,
					plan_id: proOld,
				},
			);
			const previewPlanIds = collectResponsePlanIds(preview);
			expect(previewPlanIds.length).toBeGreaterThan(0);
			expect(previewPlanIds.every((id) => id !== proOld)).toBe(true);
			expect(previewPlanIds).toContain(proNew);

			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: proOld,
			});
			await expectCustomerProducts({
				customerId,
				autumn: autumnV2_3,
				active: [proNew],
			});
			await expectStripeSubscriptionCorrect({ ctx, customerId });

			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: addonOld,
				remove_plan_ids: [proOld],
			});
			await expectCustomerProducts({
				customerId,
				autumn: autumnV2_3,
				active: [addonNew],
				notPresent: [proNew],
			});

			await autumnV2_3.post("/attach", {
				customer_id: otherId,
				product_id: proOld,
				redirect_mode: "if_required",
			});
			await expectCustomerProducts({
				customerId: otherId,
				autumn: autumnV2_3,
				active: [proNew],
			});

			await autumnV2_3.cancel({
				customer_id: otherId,
				product_id: proOld,
				cancel_immediately: false,
			});
			await expectCustomerProducts({
				customerId: otherId,
				autumn: autumnV2_3,
				canceling: [proNew],
			});
		} finally {
			await autumnV2_3.customers.delete(customerId).catch(() => {});
			await autumnV2_3.customers.delete(otherId).catch(() => {});
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("plan aliases billing: update / preview_update / cancel / multi_update")}`,
	async () => {
		const customerId = uniqueTestId("alias_upd");
		const otherId = uniqueTestId("alias_upd_b");
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: otherId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		const oldId = pro.id;
		const newId = `${oldId}_n`;
		const planIds = [oldId, newId];

		await deleteAliases({ ctx, planIds });
		try {
			await renamePlan({ autumn: autumnV2_3, fromId: oldId, toId: newId });

			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: oldId,
			});
			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: otherId,
				plan_id: oldId,
			});

			const preview = await autumnV2_3.billing.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				{
					customer_id: customerId,
					plan_id: oldId,
					cancel_action: "cancel_end_of_cycle",
				},
			);
			expect(collectResponsePlanIds(preview)).toContain(newId);

			await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: oldId,
				cancel_action: "cancel_end_of_cycle",
			});
			await expectCustomerProducts({
				customerId,
				autumn: autumnV2_3,
				canceling: [newId],
			});

			await autumnV2_3.billing.previewMultiUpdate<MultiUpdateParamsV0Input>({
				customer_id: otherId,
				updates: [{ plan_id: oldId, cancel_action: "cancel_end_of_cycle" }],
			});
			await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
				customer_id: otherId,
				updates: [{ plan_id: oldId, cancel_action: "cancel_end_of_cycle" }],
			});
			await expectCustomerProducts({
				customerId: otherId,
				autumn: autumnV2_3,
				canceling: [newId],
			});
			await expectStripeSubscriptionCorrect({ ctx, customerId });
		} finally {
			await autumnV2_3.customers.delete(customerId).catch(() => {});
			await autumnV2_3.customers.delete(otherId).catch(() => {});
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("plan aliases billing: multi_attach / preview_multi_attach / create_schedule")}`,
	async () => {
		const customerId = uniqueTestId("alias_ma");
		const scheduleId = uniqueTestId("alias_sch");
		const planA = products.pro({
			id: "plana",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planB = products.pro({
			id: "planb",
			items: [items.monthlyWords({ includedUsage: 50 })],
			group: "group-b",
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [planA, planB] }),
				s.otherCustomers([{ id: scheduleId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		const aOld = planA.id;
		const aNew = `${aOld}_n`;
		const bOld = planB.id;
		const bNew = `${bOld}_n`;
		const planIds = [aOld, aNew, bOld, bNew];

		await deleteAliases({ ctx, planIds });
		try {
			await renamePlan({ autumn: autumnV2_3, fromId: aOld, toId: aNew });
			await renamePlan({ autumn: autumnV2_3, fromId: bOld, toId: bNew });

			const multiParams = {
				customer_id: customerId,
				plans: [{ plan_id: aOld }, { plan_id: bOld }],
			};
			const multiPreview = await autumnV2_3.billing.previewMultiAttach(
				multiParams,
			);
			expect(collectResponsePlanIds(multiPreview)).toContain(aNew);
			expect(collectResponsePlanIds(multiPreview)).toContain(bNew);

			await autumnV2_3.billing.multiAttach(multiParams);
			await expectCustomerProducts({
				customerId,
				autumn: autumnV2_3,
				active: [aNew, bNew],
			});
			await expectStripeSubscriptionCorrect({ ctx, customerId });

			const scheduleParams: CreateScheduleParamsV0Input = {
				customer_id: scheduleId,
				phases: [{ starts_at: "now", plans: [{ plan_id: aOld }] }],
			};
			const schedulePreview = await autumnV2_3.post(
				"/billing.preview_create_schedule",
				scheduleParams,
			);
			expect(collectResponsePlanIds(schedulePreview)).toContain(aNew);

			await autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>(
				scheduleParams,
			);
			await expectCustomerProducts({
				customerId: scheduleId,
				autumn: autumnV2_3,
				active: [aNew],
			});
		} finally {
			await autumnV2_3.customers.delete(customerId).catch(() => {});
			await autumnV2_3.customers.delete(scheduleId).catch(() => {});
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
