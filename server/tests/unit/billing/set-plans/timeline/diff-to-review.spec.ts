/** Each request phase is compared with itself: its saved self, or the phase before it when new. */

import { describe, expect, test } from "bun:test";
import {
	type CreateScheduleBillingContext,
	CusProductStatus,
	type FullProduct,
	type LineItem,
	ms,
	type SetPlansParamsV0,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import chalk from "chalk";
import { buildSetPlansPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPhaseCustomers";
import { diffToReview } from "@/internal/billing/v2/actions/setPlans/preview/review/diffToReview";
import { computeSetPlansPlanFromContext } from "../setPlansTimelineHelpers";
import {
	buildContext,
	ctx,
	momentName,
	NOW,
	PHASE_B,
	PHASE_B2,
	paidProduct,
	running,
} from "./setPlansContextFixtures";

const PHASE_C = NOW + ms.days(60);

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
		saved: timeline.saved,
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

const phaseRows = (review: Review) =>
	review.phases.map(({ plans }) =>
		plans.map((plan) => `${plan.plan_id}:${plan.status}`),
	);

const removedRows = (review: Review) =>
	review.removedPhases.map(
		({ starts_at, plans }) =>
			`${starts_at === PHASE_C ? "C" : momentName(starts_at)}: ${plans.map((plan) => `${plan.plan_id}:${plan.status}`).join(", ")}`,
	);

const pro = paidProduct({ id: "pro" });
const premium = paidProduct({ id: "premium" });
const growth = paidProduct({ id: "growth" });
const enterprise = paidProduct({ id: "enterprise" });
const bonus = paidProduct({ id: "bonus", isAddOn: true });
const sso = paidProduct({ id: "sso", isAddOn: true });

const scheduled = (input: Parameters<typeof running>[0]) =>
	running({ ...input, status: CusProductStatus.Scheduled });

/** Now [Pro, Bonus] → B [Premium, Bonus] → C [Growth]. */
const threePhaseSchedule = () => [
	running({ product: pro, endedAt: PHASE_B }),
	running({ product: bonus, endedAt: PHASE_C }),
	scheduled({ product: premium, startsAt: PHASE_B, endedAt: PHASE_C }),
	scheduled({ product: growth, startsAt: PHASE_C }),
];

describe(chalk.yellowBright("diffToReview"), () => {
	test("deleting the middle saved phase only removes that phase", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: threePhaseSchedule(),
				opening: [{ fullProduct: pro }, { fullProduct: bonus }],
				later: [{ startsAt: PHASE_C, plans: [{ fullProduct: growth }] }],
			}),
		});
		expect(phaseRows(review)).toEqual([
			["pro:kept", "bonus:kept"],
			["growth:kept"],
		]);
		expect(removedRows(review)).toEqual(["B: bonus:ends, premium:ends"]);
	});

	test("an unchanged re-sent schedule keeps every plan and removes no phase", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: threePhaseSchedule(),
				opening: [{ fullProduct: pro }, { fullProduct: bonus }],
				later: [
					{
						startsAt: PHASE_B,
						plans: [{ fullProduct: premium }, { fullProduct: bonus }],
					},
					{ startsAt: PHASE_C, plans: [{ fullProduct: growth }] },
				],
			}),
		});
		expect(phaseRows(review)).toEqual([
			["pro:kept", "bonus:kept"],
			["bonus:kept", "premium:kept"],
			["growth:kept"],
		]);
		expect(removedRows(review)).toEqual([]);
	});

	test("removing an add-on now shows it removed in the opening phase", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [running({ product: pro }), running({ product: sso })],
				opening: [{ fullProduct: pro }],
			}),
		});
		expect(phaseRows(review)).toEqual([["sso:ends", "pro:kept"]]);
	});

	test("a saved future phase that loses a plan shows it removed there only", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [
					running({ product: pro, endedAt: PHASE_B }),
					scheduled({ product: enterprise, startsAt: PHASE_B }),
					scheduled({ product: sso, startsAt: PHASE_B }),
				],
				opening: [{ fullProduct: pro }],
				later: [{ startsAt: PHASE_B, plans: [{ fullProduct: enterprise }] }],
			}),
		});
		expect(phaseRows(review)).toEqual([
			["pro:kept"],
			["sso:ends", "enterprise:kept"],
		]);
		expect(removedRows(review)).toEqual([]);
	});

	test("a phase inserted between saved phases only shows its own changes", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [
					running({ product: pro, endedAt: PHASE_B }),
					scheduled({
						product: enterprise,
						startsAt: PHASE_B,
						endedAt: PHASE_C,
					}),
					scheduled({ product: growth, startsAt: PHASE_C }),
				],
				opening: [{ fullProduct: pro }],
				later: [
					{ startsAt: PHASE_B, plans: [{ fullProduct: enterprise }] },
					{
						startsAt: PHASE_B2,
						plans: [{ fullProduct: sso }],
					},
					{ startsAt: PHASE_C, plans: [{ fullProduct: growth }] },
				],
			}),
		});
		expect(phaseRows(review)).toEqual([
			["pro:kept"],
			["enterprise:kept"],
			["sso:starts"],
			["growth:kept"],
		]);
		expect(removedRows(review)).toEqual([]);
	});

	test("a saved phase moved earlier compares with its saved self", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [
					running({ product: pro, endedAt: PHASE_B2 }),
					scheduled({ product: enterprise, startsAt: PHASE_B2 }),
				],
				opening: [{ fullProduct: pro }],
				later: [{ startsAt: PHASE_B, plans: [{ fullProduct: enterprise }] }],
			}),
		});
		expect(phaseRows(review)).toEqual([["pro:kept"], ["enterprise:kept"]]);
		expect(removedRows(review)).toEqual([]);
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
		expect(phaseRows(review)).toEqual([["pro:updated"]]);
		expect(review.phases[0]?.planChanges.length).toBeGreaterThan(0);
	});

	test("replacing a plan now ends the old plan and creates the new one", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [running({ product: pro })],
				opening: [{ fullProduct: enterprise }],
			}),
		});
		expect(phaseRows(review)).toEqual([["enterprise:starts", "pro:ends"]]);
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
		expect(phaseRows(review)).toEqual([["pro:kept"]]);
		expect(removedRows(review)).toEqual([]);
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

	test("a removed scheduled plan is reported as a withdrawn start", () => {
		const review = reviewFor({
			billingContext: buildContext({
				existing: [
					running({ product: pro, endedAt: PHASE_B }),
					scheduled({ product: enterprise, startsAt: PHASE_B }),
				],
				opening: [{ fullProduct: pro }],
			}),
		});
		expect(phaseRows(review)).toEqual([["pro:kept"]]);
		expect(removedRows(review)).toEqual(["B: enterprise:ends"]);
		expect(review.withdrawnStarts.map(({ product_id }) => product_id)).toEqual([
			"enterprise",
		]);
	});
});
