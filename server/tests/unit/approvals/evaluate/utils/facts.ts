import type { FullCusProduct } from "@autumn/shared";
import type {
	ApprovalCustomerFacts,
	BalanceCreateFacts,
	BalanceUpdateFacts,
	BillingCancelFacts,
	BillingChangeFacts,
	BillingUncancelFacts,
	CustomerChangeFacts,
	FeatureFacts,
	FreeTrialFacts,
	IncomingPlanFacts,
	InvoiceFacts,
	PlanFacts,
	RewardRedeemFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";

/** Every trial starts here unless a test needs another calendar month. */
export const TRIAL_START = Date.UTC(2026, 0, 1);

/** A catalog plan: paid plans carry a $100/mo base price, free plans none. */
const plan = ({ planId, paid = true }: { planId: string; paid?: boolean }) =>
	products.createFull({
		id: planId,
		prices: paid ? [prices.createFixed({ id: `price_${planId}` })] : [],
	});

const trial = ({
	length,
	unit = "day",
	startsAt = TRIAL_START,
	cardRequired = false,
	onEnd = "revert",
}: {
	length: number;
	unit?: FreeTrialFacts["duration"]["unit"];
	startsAt?: number;
	cardRequired?: boolean;
	onEnd?: FreeTrialFacts["on_end"];
}): FreeTrialFacts => ({
	duration: { length, unit },
	starts_at: startsAt,
	card_required: cardRequired,
	on_end: onEnd,
});

const entity = ({ featureId }: { featureId: string }) => ({
	feature_id: featureId,
});

const incomingPlan = ({
	planId,
	paid = true,
	freeTrial = null,
	featureQuantities = [],
	customized = false,
}: {
	planId: string;
	paid?: boolean;
	freeTrial?: FreeTrialFacts | null;
	featureQuantities?: IncomingPlanFacts["feature_quantities"];
	customized?: boolean;
}): IncomingPlanFacts => ({
	product: plan({ planId, paid }),
	free_trial: freeTrial,
	feature_quantities: featureQuantities,
	customized,
});

const outgoingPlan = ({ planId }: { planId: string }): FullCusProduct =>
	customerProducts.create({
		productId: planId,
		product: plan({ planId }),
	});

const customer = ({
	customerId = "cus_test",
	hasPaid = false,
	plans = [],
}: {
	customerId?: string;
	hasPaid?: boolean;
	plans?: FullCusProduct[];
} = {}): ApprovalCustomerFacts => {
	const { customer_products } = customers.create({ customerProducts: plans });
	return { id: customerId, customer_products, has_paid: hasPaid };
};

/** Attach / update / set plans / create schedule. Defaults: a $0 customer-level change with no plans. */
const billingChange = (
	overrides: Partial<BillingChangeFacts> = {},
): BillingChangeFacts => ({
	customer: customer(),
	entity: null,
	incoming: [],
	outgoing: [],
	paid: false,
	checkout: false,
	total: 0,
	next_cycle: null,
	discounts: [],
	plan_schedule: null,
	proration_behavior: null,
	billing_cycle_anchor: "unchanged",
	starts_at: null,
	invoice_mode: null,
	...overrides,
});

const billingCancel = (
	overrides: Partial<BillingCancelFacts> = {},
): BillingCancelFacts => ({
	customer: customer(),
	entity: null,
	cancel_action: "cancel_end_of_cycle",
	outgoing: [],
	refund: null,
	...overrides,
});

const billingUncancel = (
	overrides: Partial<BillingUncancelFacts> = {},
): BillingUncancelFacts => ({
	customer: customer(),
	entity: null,
	outgoing: [],
	...overrides,
});

const invoice = (overrides: Partial<InvoiceFacts> = {}): InvoiceFacts => ({
	customer: customer(),
	total: 0,
	refund: null,
	...overrides,
});

const balanceCreate = (
	overrides: Partial<BalanceCreateFacts> = {},
): BalanceCreateFacts => ({
	customer: customer(),
	feature_id: "ai_credits",
	included_grant: 0,
	unlimited: false,
	expires_at: null,
	reset: null,
	...overrides,
});

const balanceUpdate = (
	overrides: Partial<BalanceUpdateFacts> = {},
): BalanceUpdateFacts => ({
	customer: customer(),
	feature_id: "ai_credits",
	included_grant: null,
	add_to_balance: null,
	remaining: null,
	usage: null,
	...overrides,
});

const rewardRedeem = (
	overrides: Partial<RewardRedeemFacts> = {},
): RewardRedeemFacts => ({
	customer: customer(),
	reward_id: "summer_sale",
	...overrides,
});

const customerChange = (
	overrides: Partial<CustomerChangeFacts> = {},
): CustomerChangeFacts => ({
	customer: customer(),
	...overrides,
});

const planChange = ({
	planId = "pro",
}: {
	planId?: string;
} = {}): PlanFacts => ({
	plan_id: planId,
});

const featureChange = ({
	featureId = "ai_credits",
}: {
	featureId?: string;
} = {}): FeatureFacts => ({ feature_id: featureId });

export const facts = {
	trial,
	entity,
	incomingPlan,
	outgoingPlan,
	customer,
	billingChange,
	billingCancel,
	billingUncancel,
	invoice,
	balanceCreate,
	balanceUpdate,
	rewardRedeem,
	customerChange,
	planChange,
	featureChange,
} as const;
