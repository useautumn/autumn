/**
 * S4b contract: PRD §8 "How A–F combine", row by row. Rules A→F are stored in
 * that order; only matching rules count, the most specific level decides, then
 * the rule later in the list.
 *
 * Red (before):  no `effect`/`position`; the first level with any rule decided; admins were exempt.
 * Green (after): each row's verdict and deciding rule match the PRD table.
 */

import { describe, expect, test } from "bun:test";
import { evaluateApprovalRules } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { principals, storedRules } from "./utils/principals.js";

const orgRules = storedRules(rules.prdExamples());
const ruleId = (name: string) =>
	orgRules.find((rule) => rule.name === name)?.id;

const sales = principals.member({ roleId: "sales", userId: "usr_sam" });
const admin = principals.member({ roleId: "admin", userId: "usr_kevin" });
const owner = principals.member({ roleId: "owner", userId: "usr_olive" });
const taylor = principals.member({ roleId: "admin", userId: "usr_taylor" });

const deployment = facts.entity({ featureId: "deployments" });
const oneMonthTrial = facts.trial({ length: 1, unit: "month" });

const attach = ({
	planId,
	hasPaid = false,
	paid,
	trial = null,
	customized = false,
	onDeployment = true,
}: {
	planId: string;
	hasPaid?: boolean;
	paid: boolean;
	trial?: ReturnType<typeof facts.trial> | null;
	customized?: boolean;
	onDeployment?: boolean;
}) =>
	facts.billingChange({
		customer: facts.customer({ hasPaid }),
		entity: onDeployment ? deployment : null,
		paid,
		incoming: [facts.incomingPlan({ planId, freeTrial: trial, customized })],
	});

const cancelEnterprise = facts.billingCancel({
	cancel_action: "cancel_end_of_cycle",
	outgoing: [facts.outgoingPlan({ planId: "enterprise" })],
});

type Principal = ReturnType<typeof principals.member>;

const attachAs =
	({
		principal,
		request,
	}: {
		principal: Principal;
		request: ReturnType<typeof attach>;
	}) =>
	() =>
		evaluateApprovalRules({
			principal,
			action: "billing.attach",
			facts: request,
			rules: orgRules,
		});

const cancelEnterpriseAs =
	({ principal }: { principal: Principal }) =>
	() =>
		evaluateApprovalRules({
			principal,
			action: "billing.cancel",
			facts: cancelEnterprise,
			rules: orgRules,
		});

const ROWS = [
	{
		name: "Sales: 1-month Enterprise trial, new customer, on a deployment",
		run: attachAs({
			principal: sales,
			request: attach({
				planId: "enterprise",
				paid: false,
				trial: oneMonthTrial,
			}),
		}),
		verdict: "allow",
		decidedBy: { level: "role", rule: "Sales: Enterprise trials" },
	},
	{
		name: "Sales: same trial, customer paid before",
		run: attachAs({
			principal: sales,
			request: attach({
				planId: "enterprise",
				paid: false,
				trial: oneMonthTrial,
				hasPaid: true,
			}),
		}),
		verdict: "allow",
		decidedBy: { level: "role", rule: "Sales: Enterprise trials" },
	},
	{
		name: "Sales: attach Pro",
		run: attachAs({
			principal: sales,
			request: attach({ planId: "pro", paid: true }),
		}),
		verdict: "deny",
		decidedBy: { level: "everyone", rule: "No billing changes" },
	},
	{
		name: "Admin: attach Pro on a deployment",
		run: attachAs({
			principal: admin,
			request: attach({ planId: "pro", paid: true }),
		}),
		verdict: "deny",
		decidedBy: { level: "everyone", rule: "No billing changes" },
	},
	{
		name: "Admin: attach Pro with no entity (C is later than A)",
		run: attachAs({
			principal: admin,
			request: attach({ planId: "pro", paid: true, onDeployment: false }),
		}),
		verdict: "deny",
		decidedBy: { level: "everyone", rule: "Plans on deployments" },
	},
	{
		name: "Taylor (admin): cancel Enterprise",
		run: cancelEnterpriseAs({ principal: taylor }),
		verdict: "allow",
		decidedBy: { level: "user", rule: "Taylor and Kyle cancel Enterprise" },
	},
	{
		name: "Kevin (admin): cancel Enterprise",
		run: cancelEnterpriseAs({ principal: admin }),
		verdict: "deny",
		decidedBy: { level: "everyone", rule: "No Enterprise cancels" },
	},
	{
		name: "Sales: Enterprise with custom pricing (F is later than A's allow)",
		run: attachAs({
			principal: sales,
			request: attach({
				planId: "enterprise",
				paid: false,
				trial: oneMonthTrial,
				customized: true,
			}),
		}),
		verdict: "deny",
		decidedBy: { level: "role", rule: "Sales: no custom pricing" },
	},
	{
		name: "Owner: attach Pro",
		run: attachAs({
			principal: owner,
			request: attach({ planId: "pro", paid: true }),
		}),
		verdict: "deny",
		decidedBy: { level: "everyone", rule: "No billing changes" },
	},
];

describe("PRD §8: how A–F combine", () => {
	test.each(ROWS)("$name → $verdict", (row) => {
		expect(row.run()).toMatchObject({
			verdict: row.verdict,
			decided_by: {
				level: row.decidedBy.level,
				rule_id: ruleId(row.decidedBy.rule),
				rule_name: row.decidedBy.rule,
			},
		});
	});
});
