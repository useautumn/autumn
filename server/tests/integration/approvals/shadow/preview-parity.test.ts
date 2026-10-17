import { test } from "bun:test";
import { ms, type SetPlansParamsV0Input } from "@autumn/shared";
import {
	expectDecisionLogged,
	expectPreviewMatchesDecision,
} from "@tests/integration/approvals/utils/expectDecisionLogged";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** The preview's verdict equals the decision its write logs, route by route (PRD §7). */

const setupParity = async ({
	customerId,
	attached = false,
	rule,
}: {
	customerId: string;
	attached?: boolean;
	rule: (
		userId: string,
	) => Parameters<typeof setupApprovalRules>[0]["rules"][number];
}) => {
	const messages = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messages] });
	const premium = products.premium({ items: [messages] });
	const addon = products.recurringAddOn({ id: "addon", items: [messages] });
	const { ctx, members, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, addon] }),
			s.member({ role: "owner" }),
			s.member({ role: "sales" }),
		],
		actions: attached ? [s.attach({ productId: pro.id })] : [],
	});
	const [owner, sales] = members;
	const { client, cleanup } = await setupApprovalRules({
		ctx,
		owner,
		member: sales,
		rules: [rule(sales.userId)],
	});
	return { ctx, sales, client, cleanup, pro, premium, addon, advancedTo };
};

const blockPaid = (userId: string) =>
	rules.block({
		name: "No charges",
		subjects: [{ type: "user", user_id: userId }],
		actions: [
			"billing.attach",
			"billing.update",
			"billing.set_plans",
			"billing.create_schedule",
		],
		filter: { paid: true },
	});

test.concurrent(
	`${chalk.yellowBright("preview parity 1: a multi-attach is judged plan by plan as billing.attach")}`,
	async () => {
		const { ctx, sales, client, cleanup, pro, addon } = await setupParity({
			customerId: "approvals-parity-attach",
			rule: blockPaid,
		});
		const customerId = "approvals-parity-attach";

		try {
			const multiParams = {
				customer_id: customerId,
				plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
			};
			const multiPreview = await client.billing.previewMultiAttach(multiParams);
			await client.billing.multiAttach(multiParams);
			expectPreviewMatchesDecision({
				permission: multiPreview.permission,
				decision: await expectDecisionLogged({
					ctx,
					userId: sales.userId,
					action: "billing.attach",
					verdict: "deny",
				}),
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("preview parity 2: an update that cancels is judged and logged as billing.cancel")}`,
	async () => {
		const customerId = "approvals-parity-cancel";
		const { ctx, sales, client, cleanup, pro } = await setupParity({
			customerId,
			attached: true,
			rule: (userId) =>
				rules.block({
					name: "No immediate cancels",
					subjects: [{ type: "user", user_id: userId }],
					actions: ["billing.cancel"],
					filter: { cancel_action: "cancel_immediately" },
				}),
		});

		try {
			const params = {
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_immediately" as const,
			};
			const preview = await client.subscriptions.previewUpdate(params);
			await client.subscriptions.update(params);
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
	`${chalk.yellowBright("preview parity 3: set plans and create schedule are judged as themselves")}`,
	async () => {
		const customerId = "approvals-parity-set-plans";
		const { ctx, sales, client, cleanup, pro, premium, advancedTo } =
			await setupParity({ customerId, attached: true, rule: blockPaid });

		try {
			const setPlans: SetPlansParamsV0Input = {
				customer_id: customerId,
				phases: [
					{ starts_at: "now", plans: [{ plan_id: premium.id }] },
					{
						starts_at: advancedTo + ms.days(40),
						plans: [{ plan_id: pro.id }],
					},
				],
			};
			const preview = await client.billing.previewSetPlans(setPlans);
			await client.billing.setPlans(setPlans);
			expectPreviewMatchesDecision({
				permission: (preview as { permission?: Record<string, unknown> })
					.permission,
				decision: await expectDecisionLogged({
					ctx,
					userId: sales.userId,
					action: "billing.set_plans",
					verdict: "deny",
				}),
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("preview parity 4: a plain attach")}`,
	async () => {
		const customerId = "approvals-parity-plain-attach";
		const { ctx, sales, client, cleanup, pro } = await setupParity({
			customerId,
			rule: blockPaid,
		});

		try {
			const params = { customer_id: customerId, plan_id: pro.id };
			const preview = await client.billing.previewAttach(params);
			await client.billing.attach(params);
			expectPreviewMatchesDecision({
				permission: preview.permission,
				decision: await expectDecisionLogged({
					ctx,
					userId: sales.userId,
					action: "billing.attach",
					verdict: "deny",
				}),
			});
		} finally {
			await cleanup();
		}
	},
);
