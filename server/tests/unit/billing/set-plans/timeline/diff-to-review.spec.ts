/** Preview rows come straight from the diff: what happens at each date, and whether this request causes it. */

import { describe, expect, test } from "bun:test";
import {
	type CreateScheduleBillingContext,
	CusProductStatus,
	type FullProduct,
	type LineItem,
	type SetPlansParamsV0,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { buildSetPlansPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPhaseCustomers";
import { diffToReview } from "@/internal/billing/v2/actions/setPlans/preview/diffToReview/diffToReview";
import { computeSetPlansPlanFromContext } from "../setPlansTimelineHelpers";
import {
	buildContext,
	ctx,
	momentName,
	PHASE_B,
	PHASE_B2,
	paidProduct,
	running,
} from "./setPlansContextFixtures";

const reviewFor = ({
	billingContext,
	undeclaredPlans = "end",
	creditLineItems = [],
}: {
	billingContext: CreateScheduleBillingContext;
	undeclaredPlans?: NonNullable<SetPlansParamsV0["undeclared_plans"]>;
	creditLineItems?: LineItem[];
}) => {
	const { autumnBillingPlan, phases, timeline, customerProductChanges } =
		computeSetPlansPlanFromContext({ ctx, billingContext, undeclaredPlans });
	const [finalFullCustomer] = buildSetPlansPhaseCustomers({
		ctx,
		fullCustomer: billingContext.fullCustomer,
		autumnBillingPlan,
		phases,
	});
	return diffToReview({
		diff: timeline.diff,
		phaseStarts: phases.map(({ startsAt }) => startsAt),
		lookup: {
			originalFullCustomer: billingContext.fullCustomer,
			finalFullCustomer: finalFullCustomer ?? billingContext.fullCustomer,
			customerProductIdBySegmentId:
				customerProductChanges.customerProductIdBySegmentId,
		},
		creditLineItems,
		currency: "usd",
	});
};

type Review = ReturnType<typeof reviewFor>;

/** Rows as `plan:status:origin[<-previous][~ends]` per phase. */
const phaseRows = (review: Review) =>
	review.phases.map(({ plans }) =>
		plans.map(
			(plan) =>
				`${plan.plan_id}:${plan.status}:${plan.origin}${plan.previous_plan_id && plan.previous_plan_id !== plan.plan_id ? `<-${plan.previous_plan_id}` : ""}${plan.expires_at === null ? "" : `~${momentName(plan.expires_at)}`}`,
		),
	);

const unlistedRows = (review: Review) =>
	review.unlistedPhases.map(
		({ starts_at, plans }) =>
			`${momentName(starts_at)}: ${plans.map((plan) => `${plan.plan_id}:${plan.status}:${plan.origin}`).join(", ")}`,
	);

const pro = paidProduct({ id: "pro" });
const enterprise = paidProduct({ id: "enterprise" });
const sso = paidProduct({ id: "sso", isAddOn: true });
const free: FullProduct = {
	...products.createFull({ id: "free", prices: [] }),
	group: "main",
};

const scheduled = (input: Parameters<typeof running>[0]) =>
	running({ ...input, status: CusProductStatus.Scheduled });

describe(chalk.yellowBright("diffToReview"), () => {
	test("a plan created for the opening phase only shows its end on its Created row", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [
					running({ product: pro, endedAt: PHASE_B }),
					scheduled({ product: enterprise, startsAt: PHASE_B }),
				],
				opening: [{ fullProduct: pro }, { fullProduct: sso }],
				later: [{ startsAt: PHASE_B, plans: [{ fullProduct: enterprise }] }],
			}),
		});
		expect(phaseRows(review)).toEqual([
			["sso:starts:request~B", "pro:kept:request~B"],
			["enterprise:switches:saved<-pro"],
		]);
	});

	test("switching a plan now is one switch row naming the previous plan", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [running({ product: pro })],
				opening: [{ fullProduct: enterprise }],
			}),
		});
		expect(phaseRows(review)).toEqual([["enterprise:switches:request<-pro"]]);
	});

	test("a new version of a running plan is updated, with its change listed", () => {
		const proV2: FullProduct = {
			...paidProduct({ id: "pro" }),
			internal_id: "internal_pro_v2",
			version: 2,
			prices: [prices.createFixed({ id: "price_pro_v2" })],
		};
		const review = reviewFor({
			billingContext: buildContext({
				existing: [running({ product: pro })],
				opening: [{ fullProduct: proV2 }],
			}),
		});
		expect(phaseRows(review)).toEqual([["pro:updated:request"]]);
		expect(review.phases[0]?.planChanges.length).toBeGreaterThan(0);
	});

	test("a new phase that leaves out the free plan shows it ending", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [running({ product: free }), running({ product: sso })],
				opening: [{ fullProduct: free }, { fullProduct: sso }],
				later: [{ startsAt: PHASE_B, plans: [{ fullProduct: sso }] }],
			}),
		});
		expect(phaseRows(review)).toEqual([
			["free:kept:request~B", "sso:kept:request"],
			["free:ends:request~B"],
		]);
	});

	test("a removed saved phase is reported on its own date as withdrawn", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [
					running({ product: pro, endedAt: PHASE_B }),
					scheduled({ product: enterprise, startsAt: PHASE_B }),
				],
				opening: [{ fullProduct: pro }],
			}),
		});
		expect(phaseRows(review)).toEqual([["pro:kept:request"]]);
		expect(unlistedRows(review)).toEqual(["B: enterprise:switches:withdrawn"]);
		expect(review.withdrawnStarts.map(({ product_id }) => product_id)).toEqual([
			"enterprise",
		]);
	});

	test("a moved phase withdraws the old date and switches on the new one", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [
					running({ product: pro, endedAt: PHASE_B }),
					scheduled({ product: enterprise, startsAt: PHASE_B }),
				],
				opening: [{ fullProduct: pro }],
				later: [{ startsAt: PHASE_B2, plans: [{ fullProduct: enterprise }] }],
			}),
		});
		expect(phaseRows(review)).toEqual([
			["pro:kept:request~B2"],
			["enterprise:switches:request<-pro"],
		]);
		expect(unlistedRows(review)).toEqual(["B: enterprise:switches:withdrawn"]);
	});

	test("a saved end the request keeps appears muted on its date", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [
					running({ product: pro }),
					running({ product: sso, endedAt: PHASE_B }),
				],
				opening: [{ fullProduct: pro }, { fullProduct: sso }],
				later: [{ startsAt: PHASE_B, plans: [{ fullProduct: pro }] }],
			}),
		});
		expect(phaseRows(review)).toEqual([
			["pro:kept:request", "sso:kept:request~B"],
			["sso:ends:saved~B"],
		]);
	});

	test("a plan billed on another subscription is left out of the preview", () => {
		const proOnA = running({ product: pro, subscriptionIds: ["sub_a"] });
		const ssoOnB = running({ product: sso, subscriptionIds: ["sub_b"] });
		const review = reviewFor({
			billingContext: buildContext({
				existing: [proOnA, ssoOnB],
				opening: [{ fullProduct: pro }],
				stripeSubscriptionScope: {
					stripeSubscriptionId: "sub_a",
					customerProductIds: [proOnA.id],
					otherStripeSubscriptionIds: ["sub_b"],
				},
			}),
		});
		expect(phaseRows(review)).toEqual([["pro:kept:request"]]);
		expect(unlistedRows(review)).toEqual([]);
	});

	test("a plan ending now carries only its own credit", () => {
		const proRow = running({ product: pro });
		const credit = {
			chargeImmediately: true,
			amountAfterDiscounts: -12.5,
			context: { customerProduct: proRow },
		} as unknown as LineItem;
		const review = reviewFor({
			billingContext: buildContext({
				existing: [proRow, running({ product: sso })],
				opening: [{ fullProduct: sso }],
			}),
			creditLineItems: [credit],
		});
		expect(
			review.phases[0]?.plans.map(({ plan_id, credit }) => [plan_id, credit]),
		).toEqual([
			["pro", -12.5],
			["sso", null],
		]);
	});
});
