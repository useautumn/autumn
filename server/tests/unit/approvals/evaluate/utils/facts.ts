import type { FullCusProduct } from "@autumn/shared";
import type {
	BalanceCreateFacts,
	BalanceUpdateFacts,
	BillingCancelFacts,
	BillingChangeFacts,
	CatalogFeatureFacts,
	CatalogPlanFacts,
	CustomerFacts,
	FreeTrialFacts,
	IncomingPlanFacts,
	InvoiceFacts,
	RewardApplyFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";

/** A catalog plan: paid plans carry a $100/mo base price, free plans none. */
const plan = ({ planId, paid = true }: { planId: string; paid?: boolean }) =>
	products.createFull({
		id: planId,
		prices: paid ? [prices.createFixed({ id: `price_${planId}` })] : [],
	});

const trial = ({
	length,
	type = "day",
	cardRequired = false,
	onEnd = "revert",
}: {
	length: number;
	type?: FreeTrialFacts["duration_type"];
	cardRequired?: boolean;
	onEnd?: FreeTrialFacts["on_end"];
}): FreeTrialFacts => ({
	duration_length: length,
	duration_type: type,
	card_required: cardRequired,
	on_end: onEnd,
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
}: {
	customerId?: string;
} = {}) => ({
	...customers.create({}),
	id: customerId,
});

/** Attach / update / set plans / schedule. Defaults: a $0 change with no plans. */
const billingChange = (
	overrides: Partial<BillingChangeFacts> = {},
): BillingChangeFacts => ({
	customer: customer(),
	incoming: [],
	outgoing: [],
	paid: false,
	checkout: false,
	total: 0,
	next_cycle: null,
	discounts: [],
	plan_schedule: null,
	proration_behavior: null,
	starts_at: null,
	invoice_mode: null,
	...overrides,
});

const billingCancel = (
	overrides: Partial<BillingCancelFacts> = {},
): BillingCancelFacts => ({
	customer: customer(),
	cancel_action: "cancel_end_of_cycle",
	outgoing: [],
	refund: null,
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

const rewardApply = (
	overrides: Partial<RewardApplyFacts> = {},
): RewardApplyFacts => ({
	customer: customer(),
	reward_id: "summer_sale",
	...overrides,
});

const customerChange = (
	overrides: Partial<CustomerFacts> = {},
): CustomerFacts => ({
	customer: customer(),
	...overrides,
});

const catalogPlan = ({ planId }: { planId: string }): CatalogPlanFacts => ({
	plan_id: planId,
});

const catalogFeature = ({
	featureId,
}: {
	featureId: string;
}): CatalogFeatureFacts => ({ feature_id: featureId });

export const facts = {
	trial,
	incomingPlan,
	outgoingPlan,
	customer,
	billingChange,
	billingCancel,
	invoice,
	balanceCreate,
	balanceUpdate,
	rewardApply,
	customerChange,
	catalogPlan,
	catalogFeature,
} as const;
