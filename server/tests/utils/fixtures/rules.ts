import type {
	ApprovalAction,
	ApprovalRuleParams,
	RuleSubject,
} from "@autumn/shared";

const sales: RuleSubject = { type: "role", role: "sales" };

/** Any rule; defaults to "Everyone can attach", with no conditions. */
const rule = (
	overrides: Partial<ApprovalRuleParams> = {},
): ApprovalRuleParams => ({
	name: "Test rule",
	subjects: [{ type: "everyone" }],
	actions: ["billing.attach"],
	when: null,
	note: null,
	enabled: true,
	...overrides,
});

/** Who-only rule: these subjects can do these actions, no conditions. */
const whoOnly = ({
	actions,
	subjects = [sales],
}: {
	actions: ApprovalAction[];
	subjects?: RuleSubject[];
}) => rule({ name: "Who only", subjects, actions });

/** Complex case 1: trials on one plan, under 2 months, no charge. */
const enterpriseTrials = ({
	planId = "enterprise",
	subjects = [sales],
}: {
	planId?: string;
	subjects?: RuleSubject[];
} = {}) =>
	rule({
		name: "Enterprise trials",
		subjects,
		actions: ["billing.attach", "billing.update_subscription"],
		when: {
			paid: false,
			incoming: {
				$every: {
					plan_id: planId,
					$or: [
						{ free_trial: null },
						{
							free_trial: {
								duration_type: "day",
								duration_length: { $lt: 60 },
							},
						},
						{
							free_trial: {
								duration_type: "month",
								duration_length: { $lt: 2 },
							},
						},
					],
				},
			},
		},
		note: "Sales can only give trials on Enterprise, up to 2 months.",
	});

/** Complex case 2: discounts up to a percentage, recurring plans only. */
const recurringDiscounts = ({
	maxPercentOff = 20,
	subjects = [sales],
}: {
	maxPercentOff?: number;
	subjects?: RuleSubject[];
} = {}) =>
	rule({
		name: "Recurring discounts",
		subjects,
		actions: ["billing.attach", "billing.update_subscription"],
		when: {
			discounts: { $every: { percent_off: { $lte: maxPercentOff } } },
			incoming: { $every: { recurring: true } },
		},
		note: "Discounts over 20% need Finance.",
	});

/** Complex case 3: cancel at cycle end, or immediately on one plan with a capped refund. */
const supportCancellations = ({
	planId = "starter",
	maxRefund = 50,
	subjects = [{ type: "role", role: "support" }],
}: {
	planId?: string;
	maxRefund?: number;
	subjects?: RuleSubject[];
} = {}) =>
	rule({
		name: "Support cancellations",
		subjects,
		actions: ["billing.cancel"],
		when: {
			$or: [
				{ cancel_action: "cancel_end_of_cycle" },
				{
					cancel_action: "cancel_immediately",
					outgoing: { $every: { plan_id: planId } },
					$or: [{ refund: null }, { refund: { amount: { $lte: maxRefund } } }],
				},
			],
		},
		note: "Immediate cancels: Starter only, refunds up to $50.",
	});

/** Complex case 4: grant up to an amount of one feature. */
const creditGrants = ({
	featureId = "ai_credits",
	maxGrant,
	subjects,
}: {
	featureId?: string;
	maxGrant: number;
	subjects: RuleSubject[];
}) =>
	rule({
		name: "Credit grants",
		subjects,
		actions: ["balances.create"],
		when: { feature_id: featureId, included_grant: { $lte: maxGrant } },
	});

export const rules = {
	rule,
	whoOnly,
	enterpriseTrials,
	recurringDiscounts,
	supportCancellations,
	creditGrants,
} as const;
