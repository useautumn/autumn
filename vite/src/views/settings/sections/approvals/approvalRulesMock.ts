import type { ApprovalRule, CreateApprovalRuleParams } from "@autumn/shared";

export type ApprovalRulesApi = {
	list: () => Promise<{ list: ApprovalRule[] }>;
	update: (params: {
		id: string;
		params: Partial<CreateApprovalRuleParams>;
	}) => Promise<ApprovalRule>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const mockRule = ({
	daysAgo,
	editor,
	...rule
}: Pick<ApprovalRule, "id" | "name" | "subjects" | "actions" | "when"> &
	Partial<ApprovalRule> & {
		daysAgo: number;
		editor: string;
	}): ApprovalRule => {
	const at = Date.now() - daysAgo * DAY_MS;
	return {
		note: null,
		enabled: true,
		version: 1,
		created_at: at,
		updated_at: at,
		updated_by: {
			user_id: `usr_${editor.split(" ")[0].toLowerCase()}`,
			name: editor,
		},
		...rule,
	};
};

let rules: ApprovalRule[] = [
	mockRule({
		id: "apr_trials",
		name: "Short trials",
		subjects: [
			{ type: "role", role: "sales" },
			{ type: "role", role: "engineering" },
			{ type: "user", user_id: "usr_john" },
		],
		actions: [
			"billing.attach",
			"billing.update_subscription",
			"billing.set_plans",
		],
		when: {
			incoming: {
				$every: {
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
			paid: false,
		},
		note: "Sales can only give trials up to 2 months.",
		daysAgo: 3,
		editor: "Charlie Lamb",
	}),
	mockRule({
		id: "apr_cancel",
		name: "Support cancellations",
		subjects: [{ type: "role", role: "support" }],
		actions: ["billing.cancel"],
		when: { cancel_action: "cancel_end_of_cycle" },
		daysAgo: 6,
		editor: "Ana Ruiz",
	}),
	mockRule({
		id: "apr_checkout",
		name: "Checkout links",
		subjects: [{ type: "role", role: "sales" }],
		actions: ["billing.attach"],
		when: {
			checkout: true,
			incoming: { $every: { plan_id: { $in: ["pro", "team"] } } },
		},
		daysAgo: 1,
		editor: "Charlie Lamb",
	}),
	mockRule({
		id: "apr_grants",
		name: "Message grants",
		subjects: [{ type: "everyone" }],
		actions: ["balances.create"],
		when: { feature_id: "messages", included_grant: { $lte: 100 } },
		daysAgo: 12,
		editor: "Tom Reid",
	}),
	mockRule({
		id: "apr_finance",
		name: "Finance trials",
		subjects: [
			{ type: "role", role: "finance" },
			{ type: "user", user_id: "usr_jack" },
		],
		actions: ["billing.attach", "billing.update_subscription"],
		when: {
			incoming: {
				$every: {
					free_trial: { duration_type: "month", duration_length: { $lte: 3 } },
				},
			},
		},
		enabled: false,
		daysAgo: 3,
		editor: "Charlie Lamb",
	}),
];

/** In-memory stand-in for the D2 `/approvals/rules` routes, same shapes as approvals-api-schema.md §2. */
export const mockApprovalRulesApi: ApprovalRulesApi = {
	list: async () => ({ list: rules }),
	update: async ({ id, params }) => {
		const rule = rules.find((candidate) => candidate.id === id);
		if (!rule) throw new Error(`Approval rule ${id} not found`);
		const updated = {
			...rule,
			...params,
			version: rule.version + 1,
			updated_at: Date.now(),
		};
		rules = rules.map((candidate) =>
			candidate.id === id ? updated : candidate,
		);
		return updated;
	},
};
