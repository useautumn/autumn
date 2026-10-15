import { expect, test } from "bun:test";
import { type AttachParamsV1Input, FreeTrialDuration } from "@autumn/shared";
import type { ApprovalPrincipal } from "@autumn/shared/api/approvals/evaluate/index.js";
import { permissionFactsClient } from "@tests/integration/approvals/utils/permissionFactsClient";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Inline rules sent with the test header are evaluated against the preview's facts. */

const salesMember: ApprovalPrincipal = {
	type: "user",
	user_id: "usr_inline_sales",
	role: "sales",
};

const salesTrials = rules.rule({
	name: "Sales trials",
	subjects: [{ type: "role", role: "sales" }],
	actions: ["billing.attach"],
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
	note: "Sales can give trials up to 31 days that never charge the customer.",
});

const setupProWithoutCard = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});
	return { pro };
};

const cardlessTrialParams = ({
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
	customize: {
		free_trial: {
			duration_length: days,
			duration_type: FreeTrialDuration.Day,
			card_required: false,
		},
	},
});

test.concurrent(
	`${chalk.yellowBright("inline rule verdict 1: a Sales rule allows a $0 attach with a 30-day trial")}`,
	async () => {
		const customerId = "approvals-inline-trial-30";
		const { pro } = await setupProWithoutCard({ customerId });

		const {
			total,
			_permission_facts: facts,
			_permission: permission,
		} = await permissionFactsClient({
			rules: [salesTrials],
			principal: salesMember,
			sandboxAsLive: true,
		}).billing.previewAttach(
			cardlessTrialParams({ customerId, planId: pro.id, days: 30 }),
		);

		expect(total).toBe(0);
		expect(facts.paid).toBe(false);
		expect(permission.verdict).toBe("allow");
		expect(permission.decided_by).toMatchObject({
			level: "role",
			rule_name: "Sales trials",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("inline rule verdict 2: the same rule denies a 45-day trial")}`,
	async () => {
		const customerId = "approvals-inline-trial-45";
		const { pro } = await setupProWithoutCard({ customerId });

		const { _permission: permission } = await permissionFactsClient({
			rules: [salesTrials],
			principal: salesMember,
			sandboxAsLive: true,
		}).billing.previewAttach(
			cardlessTrialParams({ customerId, planId: pro.id, days: 45 }),
		);

		expect(permission.verdict).toBe("deny");
		expect(permission.message).toBe(salesTrials.note);
		expect(permission.violations).toEqual([
			expect.objectContaining({
				field: "incoming[0].free_trial",
				actual: "45 days",
			}),
		]);
		expect(permission.decided_by).toMatchObject({ level: "role" });
	},
);

test.concurrent(
	`${chalk.yellowBright("inline rule verdict 3: without the live override, sandbox is exempt")}`,
	async () => {
		const customerId = "approvals-inline-sandbox-exempt";
		const { pro } = await setupProWithoutCard({ customerId });

		const { _permission: permission } = await permissionFactsClient({
			rules: [salesTrials],
			principal: salesMember,
		}).billing.previewAttach(
			cardlessTrialParams({ customerId, planId: pro.id, days: 45 }),
		);

		expect(permission).toEqual({ verdict: "allow", decided_by: null });
	},
);

test.concurrent(
	`${chalk.yellowBright("inline rule verdict 4: a malformed header is a 400")}`,
	async () => {
		const customerId = "approvals-inline-bad-header";
		const { pro } = await setupProWithoutCard({ customerId });

		const client = permissionFactsClient();
		client.headers["x-include-permission-facts"] = "not-json";

		await expect(
			client.billing.previewAttach({
				customer_id: customerId,
				plan_id: pro.id,
			}),
		).rejects.toMatchObject({ code: "invalid_request" });
	},
);
