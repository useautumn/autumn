import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	AttachAction,
	EligibilityStatus,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const creditsItem = items.monthlyCredits({ includedUsage: 100 });

// Same group (null -> auto-grouped by prefix)
const free = products.base({
	id: "free",
	isDefault: true,
	items: [creditsItem],
});
const starter = products.base({
	id: "starter",
	items: [items.monthlyPrice({ price: 5 }), creditsItem],
});
const pro = products.pro({ id: "pro", items: [creditsItem] });
const premium = products.premium({ id: "premium", items: [creditsItem] });

// Different group
const otherGroup = products.pro({
	id: "other-group",
	items: [creditsItem],
	group: "other",
});

// Add-ons
const addon = products.recurringAddOn({ id: "addon", items: [creditsItem] });

// One-off
const oneOffAddon = products.oneOffAddOn({
	id: "one-off-addon",
	items: [items.oneOffMessages()],
});
const oneOffMain = products.oneOff({
	id: "one-off-main",
	items: [items.oneOffMessages()],
});

const allProducts = [
	free,
	starter,
	pro,
	premium,
	otherGroup,
	addon,
	oneOffAddon,
	oneOffMain,
];

const findPlan = ({
	plans,
	productId,
}: {
	plans: ApiPlanV1[];
	productId: string;
}) => {
	const plan = plans.find((p) => p.id === productId);
	if (!plan) throw new Error(`Plan ${productId} not found in response`);
	return plan;
};

test.concurrent(`${chalk.yellowBright("customer-eligibility: customer on pro, list all plans")}`, async () => {
	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "cus-elig-pro",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: allProducts }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { list: plans } = await autumnV2_2.products.list<ApiPlanV1[]>({
		customer_id: customerId,
	});

	// Pro - currently active
	const proPlan = findPlan({ plans, productId: pro.id });
	expect(proPlan.customer_eligibility?.attach_action).toBe(AttachAction.None);
	expect(proPlan.customer_eligibility?.status).toBe(EligibilityStatus.Active);
	expect(proPlan.customer_eligibility?.canceling).toBe(false);

	// Premium - upgrade
	const premiumPlan = findPlan({ plans, productId: premium.id });
	expect(premiumPlan.customer_eligibility?.attach_action).toBe(
		AttachAction.Upgrade,
	);
	expect(premiumPlan.customer_eligibility?.status).toBeUndefined();

	// Starter - downgrade
	const starterPlan = findPlan({ plans, productId: starter.id });
	expect(starterPlan.customer_eligibility?.attach_action).toBe(
		AttachAction.Downgrade,
	);
	expect(starterPlan.customer_eligibility?.status).toBeUndefined();

	// Free - downgrade
	const freePlan = findPlan({ plans, productId: free.id });
	expect(freePlan.customer_eligibility?.attach_action).toBe(
		AttachAction.Downgrade,
	);
	expect(freePlan.customer_eligibility?.status).toBeUndefined();

	// Other group - activate (no plan in that group)
	const otherPlan = findPlan({ plans, productId: otherGroup.id });
	expect(otherPlan.customer_eligibility?.attach_action).toBe(
		AttachAction.Activate,
	);

	// Recurring add-on - activate (not attached)
	const addonPlan = findPlan({ plans, productId: addon.id });
	expect(addonPlan.customer_eligibility?.attach_action).toBe(
		AttachAction.Activate,
	);

	// One-off add-on - purchase
	const oneOffAddonPlan = findPlan({ plans, productId: oneOffAddon.id });
	expect(oneOffAddonPlan.customer_eligibility?.attach_action).toBe(
		AttachAction.Purchase,
	);

	// One-off main - purchase
	const oneOffMainPlan = findPlan({ plans, productId: oneOffMain.id });
	expect(oneOffMainPlan.customer_eligibility?.attach_action).toBe(
		AttachAction.Purchase,
	);

	// Verify scenario is filtered out of public API response
	for (const plan of plans) {
		if (plan.customer_eligibility) {
			const raw = plan.customer_eligibility as Record<string, unknown>;
			expect(raw.scenario).toBeUndefined();
			expect(raw.object).toBeUndefined();
		}
	}
});

test.concurrent(`${chalk.yellowBright("customer-eligibility: customer on pro canceling")}`, async () => {
	const cancelPro = products.pro({ id: "pro", items: [creditsItem] });
	const cancelPremium = products.premium({
		id: "premium",
		items: [creditsItem],
	});

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "cus-elig-cancel",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [cancelPro, cancelPremium] }),
		],
		actions: [
			s.billing.attach({ productId: cancelPro.id }),
			s.updateSubscription({
				productId: cancelPro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const { list: plans } = await autumnV2_2.products.list<ApiPlanV1[]>({
		customer_id: customerId,
	});

	// Pro should be canceling
	const proPlan = findPlan({ plans, productId: cancelPro.id });
	expect(proPlan.customer_eligibility?.attach_action).toBe(AttachAction.None);
	expect(proPlan.customer_eligibility?.status).toBe(EligibilityStatus.Active);
	expect(proPlan.customer_eligibility?.canceling).toBe(true);

	// Premium should still be upgrade (current main product is still pro, even if canceling)
	const premiumPlan = findPlan({ plans, productId: cancelPremium.id });
	expect(premiumPlan.customer_eligibility?.attach_action).toBe(
		AttachAction.Upgrade,
	);
});

test.concurrent(`${chalk.yellowBright("customer-eligibility: no customer_id, no eligibility")}`, async () => {
	const nonePro = products.pro({ id: "pro", items: [creditsItem] });

	const { autumnV2_2 } = await initScenario({
		customerId: "cus-elig-none",
		setup: [s.products({ list: [nonePro] })],
		actions: [],
	});

	const { list: plans } = await autumnV2_2.products.list<ApiPlanV1[]>();

	for (const plan of plans) {
		expect(plan.customer_eligibility).toBeUndefined();
	}
});
