import type {
	ApprovalRuleParams,
	DurationBound,
	RuleSubject,
} from "@autumn/shared";

type RuleOverrides = Partial<Omit<ApprovalRuleParams, "effect">>;

const everyone: RuleSubject = { type: "everyone" };
const sales: RuleSubject = { type: "role", role_id: "sales" };
const users = ({ userIds }: { userIds: string[] }): RuleSubject[] =>
	userIds.map((user_id) => ({ type: "user", user_id }));

const BILLING_CHANGE_ACTIONS: ApprovalRuleParams["actions"] = [
	"billing.attach",
	"billing.update",
	"billing.set_plans",
	"billing.create_schedule",
	"billing.cancel",
	"billing.uncancel",
];

const withEffect =
	(effect: ApprovalRuleParams["effect"]) =>
	(overrides: RuleOverrides = {}): ApprovalRuleParams => ({
		name: "Test rule",
		effect,
		subjects: [everyone],
		actions: ["billing.attach"],
		filter: null,
		note: null,
		enabled: true,
		...overrides,
	});

/** Any rule; defaults to "Everyone can't attach", with no conditions. */
const block = withEffect("block");
/** Any rule; defaults to "Everyone can attach", with no conditions. */
const allow = withEffect("allow");

/** PRD §8 A1: billing is locked for everyone. */
const noBillingChanges = () =>
	block({
		name: "No billing changes",
		actions: BILLING_CHANGE_ACTIONS,
		note: "Billing changes are locked. Ask an owner.",
	});

/** PRD §8 A2: Sales can give trials on one plan, shorter than a limit, with no charge. */
const salesEnterpriseTrials = ({
	planId = "enterprise",
	maxTrial = { length: 2, unit: "month" },
}: {
	planId?: string;
	maxTrial?: DurationBound;
} = {}) =>
	allow({
		name: "Sales: Enterprise trials",
		subjects: [sales],
		actions: ["billing.attach"],
		filter: {
			paid: false,
			incoming: {
				$every: {
					plan_id: planId,
					free_trial: { duration: { $lt: maxTrial } },
				},
			},
		},
	});

/** PRD §8 B: credit add-ons can't be attached to an entity. */
const creditAddonsOnCustomer = ({
	planId = "credits_addon",
}: {
	planId?: string;
} = {}) =>
	block({
		name: "Credit add-ons on the customer",
		actions: ["billing.attach", "billing.update"],
		filter: {
			incoming: { $some: { plan_id: planId } },
			entity: { $ne: null },
		},
		note: "Credit add-ons must be attached to the customer, not a deployment.",
	});

/** PRD §8 C: these plans must be attached to an entity of one type. */
const plansOnDeployments = ({
	planIds = ["pro", "enterprise", "hobby"],
	entityFeatureId = "deployments",
}: {
	planIds?: string[];
	entityFeatureId?: string;
} = {}) =>
	block({
		name: "Plans on deployments",
		actions: ["billing.attach", "billing.update"],
		filter: {
			incoming: { $some: { plan_id: { $in: planIds } } },
			$or: [
				{ entity: null },
				{ entity: { feature_id: { $ne: entityFeatureId } } },
			],
		},
		note: "Pro, Enterprise and Hobby must be attached to a deployment.",
	});

/** PRD §8 D1: nobody can cancel a plan. */
const noEnterpriseCancels = ({
	planId = "enterprise",
}: {
	planId?: string;
} = {}) =>
	block({
		name: "No Enterprise cancels",
		actions: ["billing.cancel"],
		filter: { outgoing: { $some: { plan_id: planId } } },
		note: "Only Taylor or Kyle can cancel Enterprise.",
	});

/** PRD §8 D2: these people can cancel it anyway. */
const enterpriseCancellers = ({
	userIds,
	planId = "enterprise",
}: {
	userIds: string[];
	planId?: string;
}) =>
	allow({
		name: "Taylor and Kyle cancel Enterprise",
		subjects: users({ userIds }),
		actions: ["billing.cancel"],
		filter: { outgoing: { $some: { plan_id: planId } } },
	});

/** PRD §8 E: trials on a plan only for customers who have never paid. */
const trialsForNewCustomers = ({
	planId = "enterprise",
}: {
	planId?: string;
} = {}) =>
	block({
		name: "Trials for new customers only",
		actions: ["billing.attach"],
		filter: {
			customer: { has_paid: true },
			incoming: { $some: { plan_id: planId, free_trial: { $ne: null } } },
		},
		note: "Enterprise trials are only for customers who have never paid.",
	});

/** PRD §8 F: Sales can't customize plans. */
const salesNoCustomPricing = () =>
	block({
		name: "Sales: no custom pricing",
		subjects: [sales],
		actions: ["billing.attach", "billing.update"],
		filter: { incoming: { $some: { customized: true } } },
		note: "Sales can't customize plans. Proration and billing cycle resets are fine.",
	});

/** "John ≤ 50, Engineering ≤ 500": block grants of one feature above a cap. */
const grantCap = ({
	subjects,
	featureId = "ai_credits",
	max,
}: {
	subjects: RuleSubject[];
	featureId?: string;
	max: number;
}) =>
	block({
		name: "Credit grant cap",
		subjects,
		actions: ["balances.create"],
		filter: { feature_id: featureId, included_grant: { $gt: max } },
	});

/** PRD §8 A–F in list order, as an org would have them. */
const prdExamples = ({
	cancellerUserIds = ["usr_taylor", "usr_kyle"],
}: {
	cancellerUserIds?: string[];
} = {}) => [
	noBillingChanges(),
	salesEnterpriseTrials(),
	creditAddonsOnCustomer(),
	plansOnDeployments(),
	noEnterpriseCancels(),
	enterpriseCancellers({ userIds: cancellerUserIds }),
	trialsForNewCustomers(),
	salesNoCustomPricing(),
];

export const rules = {
	block,
	allow,
	noBillingChanges,
	salesEnterpriseTrials,
	creditAddonsOnCustomer,
	plansOnDeployments,
	noEnterpriseCancels,
	enterpriseCancellers,
	trialsForNewCustomers,
	salesNoCustomPricing,
	grantCap,
	prdExamples,
} as const;
