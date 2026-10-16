import { expect, test } from "bun:test";
import { type AttachParamsV1Input, FreeTrialDuration } from "@autumn/shared";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import {
	expectPermissionDenied,
	postRaw,
} from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** With `approvals_enforced` on, a denied attach is a 403 `permission_denied` and nothing is billed. */

const NOTE =
	"Sales can give trials up to 31 days that never charge the customer.";

const setupSalesTrials = async ({
	customerId,
	paymentMethod,
}: {
	customerId: string;
	paymentMethod?: "success";
}) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx, members, autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer(paymentMethod ? { paymentMethod } : {}),
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
			rules.rule({
				name: "Sales trials",
				subjects: [{ type: "user", user_id: sales.userId }],
				when: {
					paid: false,
					incoming: {
						$every: {
							$or: [
								{ free_trial: null },
								{
									free_trial: {
										duration_type: "day",
										duration_length: { $lte: 31 },
									},
								},
							],
						},
					},
				},
				note: NOTE,
			}),
		],
	});
	return { pro, client: enforceApprovals(client), cleanup, autumnV2_1 };
};

const trialAttach = ({
	customerId,
	planId,
	days,
}: {
	customerId: string;
	planId: string;
	days: number;
}): AttachParamsV1Input => ({
	customer_id: customerId,
	plan_id: planId,
	redirect_mode: "if_required",
	customize: {
		free_trial: {
			duration_length: days,
			duration_type: FreeTrialDuration.Day,
			card_required: false,
		},
	},
});

const subscribedPlanIds = async ({
	autumn,
	customerId,
}: {
	autumn: { customers: { get: <T>(id: string) => Promise<T> } };
	customerId: string;
}) =>
	(
		await autumn.customers.get<{ subscriptions: { plan_id: string }[] }>(
			customerId,
		)
	).subscriptions.map(({ plan_id }) => plan_id);

test.concurrent(
	`${chalk.yellowBright("attach enforce 1: a 30-day card-less trial is within the rule and attaches")}`,
	async () => {
		const customerId = "approvals-enforce-trial-30";
		const { pro, client, cleanup, autumnV2_1 } = await setupSalesTrials({
			customerId,
		});

		try {
			const res = await postRaw({
				client,
				path: "/billing.attach",
				body: trialAttach({ customerId, planId: pro.id, days: 30 }),
			});
			expect(res.status).toBe(200);
			expect(
				await subscribedPlanIds({ autumn: autumnV2_1, customerId }),
			).toContain(pro.id);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("attach enforce 2: a 45-day trial is denied with the trial violation, and nothing attaches")}`,
	async () => {
		const customerId = "approvals-enforce-trial-45";
		const { pro, client, cleanup, autumnV2_1 } = await setupSalesTrials({
			customerId,
		});

		try {
			const res = await postRaw({
				client,
				path: "/billing.attach",
				body: trialAttach({ customerId, planId: pro.id, days: 45 }),
			});
			expectPermissionDenied({
				res,
				message: NOTE,
				violations: [
					{
						field: "incoming[0].free_trial",
						label: "Free trial",
						actual: "45 days",
					},
				],
				decidedBy: { level: "user", rule_name: "Sales trials" },
				allowedRoles: ["owner", "admin"],
			});
			expect(
				await subscribedPlanIds({ autumn: autumnV2_1, customerId }),
			).not.toContain(pro.id);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("attach enforce 3: a paid plan is denied on Charges customer")}`,
	async () => {
		const customerId = "approvals-enforce-paid";
		const { pro, client, cleanup } = await setupSalesTrials({
			customerId,
			paymentMethod: "success",
		});

		try {
			const res = await postRaw({
				client,
				path: "/billing.attach",
				body: { customer_id: customerId, plan_id: pro.id },
			});
			expectPermissionDenied({
				res,
				violations: [
					{
						field: "paid",
						label: "Charges customer",
						limit: false,
						actual: true,
					},
				],
			});
		} finally {
			await cleanup();
		}
	},
);
