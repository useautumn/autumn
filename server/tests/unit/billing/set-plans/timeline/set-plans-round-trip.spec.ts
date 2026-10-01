/**
 * Round trip through the real billing plan: execute it on the saved rows in
 * memory, re-read the timeline, and re-sending the same request must change nothing.
 */

import { describe, expect, test } from "bun:test";
import {
	type CreateScheduleBillingContext,
	CusProductStatus,
	type SetPlansParamsV0,
} from "@autumn/shared";
import chalk from "chalk";
import { setupSetPlansTimeline } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansTimeline";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import { computeSetPlansPlanFromContext } from "../setPlansTimelineHelpers";
import {
	buildContext,
	ctx,
	momentName,
	PHASE_B,
	PHASE_B2,
	type PlanInput,
	paidProduct,
	running,
} from "./setPlansContextFixtures";

type UndeclaredPlans = NonNullable<SetPlansParamsV0["undeclared_plans"]>;

const withCustomer = ({
	billingContext,
	fullCustomer,
}: {
	billingContext: CreateScheduleBillingContext;
	fullCustomer: CreateScheduleBillingContext["fullCustomer"];
}): CreateScheduleBillingContext => ({
	...billingContext,
	fullCustomer,
	productContexts: billingContext.productContexts.map((productContext) => ({
		...productContext,
		fullCustomer: {
			...fullCustomer,
			entity: productContext.fullCustomer.entity,
		},
	})),
});

/** Executes the request in memory, then reads the result back as a fresh request would. */
const executeAndReread = ({
	billingContext,
	undeclaredPlans,
}: {
	billingContext: CreateScheduleBillingContext;
	undeclaredPlans: UndeclaredPlans;
}) => {
	const { autumnBillingPlan, timeline } = computeSetPlansPlanFromContext({
		ctx,
		billingContext,
		undeclaredPlans,
	});
	const executed = applyAutumnBillingPlanToFullCustomer({
		fullCustomer: billingContext.fullCustomer,
		autumnBillingPlan,
	});
	const rerun = setupSetPlansTimeline({
		ctx,
		billingContext: withCustomer({ billingContext, fullCustomer: executed }),
		params: { undeclared_plans: undeclaredPlans },
	});
	return { timeline, executed, rerun };
};

const savedShape = (rerun: ReturnType<typeof setupSetPlansTimeline>) =>
	rerun.saved.segments
		.map(
			({ planId, startsAt, endsAt }) =>
				`${planId}:${startsAt <= rerun.diff.now ? "now" : momentName(startsAt)}-${momentName(endsAt)}`,
		)
		.sort();

const expectSettles = ({
	billingContext,
	undeclaredPlans = "end",
	expectedSaved,
}: {
	billingContext: CreateScheduleBillingContext;
	undeclaredPlans?: UndeclaredPlans;
	expectedSaved: string[];
}) => {
	const { rerun } = executeAndReread({ billingContext, undeclaredPlans });
	expect(savedShape(rerun)).toEqual(expectedSaved);
	expect(rerun.diff.operations.filter(({ type }) => type !== "keep")).toEqual(
		[],
	);
	expect(
		rerun.diff.transitions.filter(
			({ origin, kind }) => origin !== "saved" && kind !== "continues",
		),
	).toEqual([]);
};

const pro = paidProduct({ id: "pro" });
const hobby = paidProduct({ id: "hobby" });
const enterprise = paidProduct({ id: "enterprise" });
const sso = paidProduct({ id: "sso", isAddOn: true });

const scheduled = (input: Parameters<typeof running>[0]) =>
	running({ ...input, status: CusProductStatus.Scheduled });

describe(chalk.yellowBright("set_plans round trip"), () => {
	test("adding a plan in a new phase keeps the running plan on one row", () => {
		const { executed } = executeAndReread({
			billingContext: buildContext({
				existing: [running({ product: pro })],
				opening: [{ fullProduct: pro }],
				later: [
					{
						startsAt: PHASE_B,
						plans: [{ fullProduct: pro }, { fullProduct: sso }],
					},
				],
			}),
			undeclaredPlans: "end",
		});
		expect(
			executed.customer_products.filter(({ product }) => product.id === "pro"),
		).toHaveLength(1);

		expectSettles({
			billingContext: buildContext({
				existing: [running({ product: pro })],
				opening: [{ fullProduct: pro }],
				later: [
					{
						startsAt: PHASE_B,
						plans: [{ fullProduct: pro }, { fullProduct: sso }],
					},
				],
			}),
			expectedSaved: ["pro:now-never", "sso:B-never"],
		});
	});

	for (const undeclaredPlans of ["end", "retain"] as const) {
		test(`switching Pro for Hobby settles (${undeclaredPlans})`, () => {
			expectSettles({
				billingContext: buildContext({
					existing: [running({ product: pro }), running({ product: sso })],
					opening: [{ fullProduct: hobby }],
				}),
				undeclaredPlans,
				expectedSaved:
					undeclaredPlans === "end"
						? ["hobby:now-never"]
						: ["hobby:now-never", "sso:now-never"],
			});
		});
	}

	test("deleting a saved phase settles with the running plan ongoing", () => {
		expectSettles({
			billingContext: buildContext({
				existing: [
					running({ product: pro, endedAt: PHASE_B }),
					scheduled({ product: enterprise, startsAt: PHASE_B }),
				],
				opening: [{ fullProduct: pro }],
			}),
			expectedSaved: ["pro:now-never"],
		});
	});

	test("moving a saved phase settles at the new date", () => {
		const opening: PlanInput[] = [{ fullProduct: pro }];
		expectSettles({
			billingContext: buildContext({
				existing: [
					running({ product: pro, endedAt: PHASE_B }),
					scheduled({ product: enterprise, startsAt: PHASE_B }),
				],
				opening,
				later: [{ startsAt: PHASE_B2, plans: [{ fullProduct: enterprise }] }],
			}),
			expectedSaved: ["enterprise:B2-never", "pro:now-B2"],
		});
	});

	test("a retained plan claimed by a later phase settles ending there", () => {
		expectSettles({
			billingContext: buildContext({
				existing: [running({ product: pro })],
				opening: [{ fullProduct: sso }],
				later: [
					{
						startsAt: PHASE_B,
						plans: [{ fullProduct: sso }, { fullProduct: enterprise }],
					},
				],
			}),
			undeclaredPlans: "retain",
			expectedSaved: ["enterprise:B-never", "pro:now-B", "sso:now-never"],
		});
	});
});
