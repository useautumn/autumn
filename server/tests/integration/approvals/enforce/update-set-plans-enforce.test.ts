import { expect, test } from "bun:test";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import {
	expectPermissionDenied,
	postRaw,
} from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import type { ScenarioMember } from "@tests/utils/testInitUtils/autumnAs.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** One "no charge" rule covers update subscription and set plans alike. */

const billingUnits = 10;

const noChargeRule = ({ member }: { member: ScenarioMember }) =>
	rules.rule({
		name: "No-charge changes",
		subjects: [{ type: "user", user_id: member.userId }],
		actions: ["billing.update_subscription", "billing.set_plans"],
		when: { paid: false },
	});

const enforcedClientFor = async ({
	ctx,
	owner,
	member,
}: {
	ctx: TestContext;
	owner: ScenarioMember;
	member: ScenarioMember;
}) => {
	const { client, cleanup } = await setupApprovalRules({
		ctx,
		owner,
		member,
		rules: [noChargeRule({ member })],
	});
	return { client: enforceApprovals(client), cleanup };
};

test.concurrent(
	`${chalk.yellowBright("update and set plans enforce 1: buying more prepaid units is denied")}`,
	async () => {
		const customerId = "approvals-enforce-update-units";
		const prepaid = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: 5,
				}),
			],
		});
		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [prepaid] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [
				s.attach({
					productId: prepaid.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
			],
		});
		const [owner, sales] = members;
		const { client, cleanup } = await enforcedClientFor({
			ctx,
			owner,
			member: sales,
		});

		try {
			const res = await postRaw({
				client,
				path: "/billing.update",
				body: {
					customer_id: customerId,
					plan_id: prepaid.id,
					feature_quantities: [
						{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
					],
				},
			});
			expectPermissionDenied({
				res,
				decidedBy: { level: "user", rule_name: "No-charge changes" },
				violations: [{ field: "paid", actual: true }],
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("update and set plans enforce 2: setting a paid plan is denied, a free one goes through")}`,
	async () => {
		const customerId = "approvals-enforce-set-plans";
		const messages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ items: [messages] });
		const free = products.base({ id: "free", items: [messages] });
		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [],
		});
		const [owner, sales] = members;
		const { client, cleanup } = await enforcedClientFor({
			ctx,
			owner,
			member: sales,
		});
		const setPlans = ({ planId }: { planId: string }) =>
			postRaw({
				client,
				path: "/billing.set_plans",
				body: {
					customer_id: customerId,
					phases: [{ starts_at: "now", plans: [{ plan_id: planId }] }],
				},
			});

		try {
			expectPermissionDenied({
				res: await setPlans({ planId: pro.id }),
				violations: [{ field: "paid", actual: true }],
			});
			expect((await setPlans({ planId: free.id })).status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);
