import { test } from "bun:test";
import type {
	AttachParamsV1Input,
	CreateScheduleParamsV0Input,
} from "@autumn/shared";
import {
	expectDecisionLogged,
	expectPreviewMatchesDecision,
} from "@tests/integration/approvals/utils/expectDecisionLogged";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Parity for the routes that run through another action: create schedule, multi-update, a pending-plan edit. */

test.concurrent(
	`${chalk.yellowBright("preview parity multi 1: create schedule is judged and logged as itself")}`,
	async () => {
		const customerId = "approvals-parity-create-schedule";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, members, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [],
		});
		const [owner, sales] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.block({
					name: "No schedules",
					subjects: [{ type: "user", user_id: sales.userId }],
					actions: ["billing.create_schedule"],
				}),
			],
		});

		try {
			const params: CreateScheduleParamsV0Input = {
				customer_id: customerId,
				phases: [{ starts_at: advancedTo, plans: [{ plan_id: pro.id }] }],
			};
			const preview = await client.post(
				"/billing.preview_create_schedule",
				params,
			);
			await client.billing.createSchedule(params);
			expectPreviewMatchesDecision({
				permission: preview.permission,
				decision: await expectDecisionLogged({
					ctx,
					userId: sales.userId,
					action: "billing.create_schedule",
					verdict: "deny",
				}),
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("preview parity multi 2: a multi-update mixing an allowed and a blocked cancel is denied, and each item is logged")}`,
	async () => {
		const customerId = "approvals-parity-multi-update";
		const messages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ items: [messages] });
		const addon = products.recurringAddOn({ id: "addon", items: [messages] });
		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id }),
			],
		});
		const [owner, sales] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.block({
					name: "No immediate cancels",
					subjects: [{ type: "user", user_id: sales.userId }],
					actions: ["billing.cancel"],
					filter: { cancel_action: "cancel_immediately" },
				}),
			],
		});

		try {
			const params = {
				customer_id: customerId,
				updates: [
					{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
					{ plan_id: addon.id, cancel_action: "cancel_immediately" },
				],
			};
			const preview = await client.billing.previewMultiUpdate(params);
			await client.billing.multiUpdate(params);
			expectPreviewMatchesDecision({
				permission: preview.permission,
				decision: await expectDecisionLogged({
					ctx,
					userId: sales.userId,
					action: "billing.cancel",
					verdict: "deny",
				}),
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("preview parity multi 3: a rebilling pending-plan edit is judged and logged as billing.update")}`,
	async () => {
		const customerId = `approvals-parity-pending-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-parity",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, members, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [],
		});
		// No card on file, so the attach waits on checkout as a pending plan.
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});
		const [owner, sales] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.block({
					name: "No charges",
					subjects: [{ type: "user", user_id: sales.userId }],
					actions: ["billing.update"],
					filter: { paid: true },
				}),
			],
		});

		try {
			const params = {
				customer_id: customerId,
				plan_id: pro.id,
				customize: { price: itemsV2.monthlyPrice({ amount: 50 }) },
			};
			const preview = await client.subscriptions.previewUpdate(params);
			await client.subscriptions.update(params);
			expectPreviewMatchesDecision({
				permission: preview.permission,
				decision: await expectDecisionLogged({
					ctx,
					userId: sales.userId,
					action: "billing.update",
					verdict: "deny",
				}),
			});
		} finally {
			await cleanup();
		}
	},
);
