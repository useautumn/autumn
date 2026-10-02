/** Reading saved rows and request phases into timelines: scope, claims and the undeclared policy, never provenance. */

import { describe, expect, test } from "bun:test";
import {
	type CreateScheduleBillingContext,
	CusProductStatus,
	type FullCusProduct,
	type SetPlansParamsV0,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { setupSetPlansTimeline } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansTimeline";
import {
	planCustomerProduct,
	planProduct,
	SUBSCRIPTION_A,
	SUBSCRIPTION_B,
	scopeOver,
} from "../subscription-scope/subscriptionScopeFixtures";
import {
	buildContext,
	ctx,
	describeOperations,
	entity,
	momentName,
	PHASE_B,
	paidProduct,
	running,
} from "./setPlansContextFixtures";

const operationsFor = ({
	billingContext,
	undeclared,
}: {
	billingContext: CreateScheduleBillingContext;
	undeclared: NonNullable<SetPlansParamsV0["undeclared_plans"]>;
}) =>
	describeOperations(
		setupSetPlansTimeline({
			ctx,
			billingContext,
			params: { undeclared_plans: undeclared },
		}).diff,
	);

const pro = paidProduct({ id: "pro" });
const enterprise = paidProduct({ id: "enterprise" });
const sso = paidProduct({ id: "sso", group: "main", isAddOn: true });

describe(chalk.yellowBright("setupSetPlansTimeline"), () => {
	test("a plan whose group the opening phase claims ends now under either policy", () => {
		const billingContext = buildContext({
			existing: [running({ product: pro })],
			opening: [{ fullProduct: enterprise }],
		});
		for (const undeclared of ["end", "retain"] as const) {
			expect(operationsFor({ billingContext, undeclared })).toEqual([
				"expire:cus_prod_pro",
				"insert:enterprise@now",
			]);
		}
	});

	test("an unlisted plan ends when the request declares everything, and runs on when it retains", () => {
		const billingContext = buildContext({
			existing: [running({ product: pro })],
			opening: [{ fullProduct: sso }],
		});
		expect(operationsFor({ billingContext, undeclared: "end" })).toEqual([
			"expire:cus_prod_pro",
			"insert:sso@now",
		]);
		expect(operationsFor({ billingContext, undeclared: "retain" })).toEqual([
			"insert:sso@now",
		]);
	});

	test("a retained plan ends when a later phase claims its group", () => {
		const billingContext = buildContext({
			existing: [running({ product: pro })],
			opening: [{ fullProduct: sso }],
			later: [{ startsAt: PHASE_B, plans: [{ fullProduct: enterprise }] }],
		});
		expect(operationsFor({ billingContext, undeclared: "retain" })).toEqual([
			"insert:enterprise@B",
			"insert:sso@now",
			"retime:cus_prod_pro:B",
		]);
	});

	test("where a plan came from never changes its fate", () => {
		const attached = running({ product: pro });
		const scheduled: FullCusProduct = {
			...running({ product: pro, endedAt: PHASE_B }),
			scheduled_ids: ["sub_sched_old"],
		};
		for (const undeclared of ["end", "retain"] as const) {
			const fromAttach = operationsFor({
				billingContext: buildContext({
					existing: [attached],
					opening: [{ fullProduct: sso }],
				}),
				undeclared,
			});
			const fromSchedule = operationsFor({
				billingContext: buildContext({
					existing: [scheduled],
					opening: [{ fullProduct: sso }],
				}),
				undeclared,
			});
			expect(fromSchedule.filter((line) => !line.startsWith("retime"))).toEqual(
				fromAttach,
			);
			if (undeclared === "retain") {
				expect(fromSchedule).toContain("retime:cus_prod_pro:never");
			}
		}
	});

	test("an add-on is only claimed by its own plan, never by its group", () => {
		const otherAddOn = paidProduct({
			id: "seats",
			group: "main",
			isAddOn: true,
		});
		const billingContext = buildContext({
			existing: [running({ product: sso })],
			opening: [{ fullProduct: otherAddOn }],
		});
		expect(operationsFor({ billingContext, undeclared: "retain" })).toEqual([
			"insert:seats@now",
		]);
	});

	test("a customer-level request ends an entity plan it leaves out", () => {
		const entityPro = running({ product: pro, internalEntityId: "ent_1" });
		const billingContext = buildContext({
			existing: [entityPro],
			opening: [{ fullProduct: enterprise }],
		});
		const timeline = setupSetPlansTimeline({
			ctx,
			billingContext,
			params: { undeclared_plans: "end" },
		});
		expect(describeOperations(timeline.diff)).toEqual([
			"expire:cus_prod_pro",
			"insert:enterprise@now",
		]);
		expect(timeline.outOfScopeCustomerProductIds).toEqual([]);
	});

	test("an entity-level request leaves other entities' plans alone", () => {
		const otherEntityPro = running({ product: pro, internalEntityId: "ent_2" });
		const context = buildContext({
			existing: [otherEntityPro],
			opening: [{ fullProduct: enterprise, entity: entity("ent_1") }],
		});
		const billingContext = {
			...context,
			fullCustomer: { ...context.fullCustomer, entity: entity("ent_1") },
		};
		const timeline = setupSetPlansTimeline({
			ctx,
			billingContext,
			params: { undeclared_plans: "end" },
		});
		expect(describeOperations(timeline.diff)).toEqual([
			"insert:enterprise@now",
		]);
		expect(timeline.outOfScopeCustomerProductIds).toEqual([otherEntityPro.id]);
	});

	test("an entity plan the request names is in scope and ends when left out", () => {
		const billingContext = buildContext({
			existing: [running({ product: pro, internalEntityId: "ent_1" })],
			opening: [{ fullProduct: sso, entity: entity("ent_1") }],
		});
		expect(operationsFor({ billingContext, undeclared: "end" })).toEqual([
			"expire:cus_prod_pro",
			"insert:sso@now",
		]);
	});

	test("a one-off purchase is never ended by being left out", () => {
		const credits = products.createFull({
			id: "credits",
			prices: [prices.createOneOff({ id: "price_credits" })],
		});
		const billingContext = buildContext({
			existing: [running({ product: credits })],
			opening: [{ fullProduct: pro }],
		});
		expect(operationsFor({ billingContext, undeclared: "end" })).toEqual([
			"insert:pro@now",
		]);
	});

	test("a scheduled plan the request drops is deleted", () => {
		const billingContext = buildContext({
			existing: [
				running({ product: pro, endedAt: PHASE_B }),
				running({
					product: enterprise,
					status: CusProductStatus.Scheduled,
					startsAt: PHASE_B,
				}),
			],
			opening: [{ fullProduct: pro }],
		});
		for (const undeclared of ["end", "retain"] as const) {
			expect(operationsFor({ billingContext, undeclared })).toEqual([
				"delete:cus_prod_enterprise",
				"retime:cus_prod_pro:never",
			]);
		}
	});

	test("a plan billed on another subscription is never touched by a targeted request", () => {
		const seats = planProduct({ id: "seats", group: "", isAddOn: true });
		const proOnA = planCustomerProduct({
			id: "cus_prod_pro",
			product: planProduct({ id: "pro" }),
			subscriptionIds: [SUBSCRIPTION_A],
		});
		const seatsOnB = planCustomerProduct({
			id: "cus_prod_seats",
			product: seats,
			subscriptionIds: [SUBSCRIPTION_B],
		});
		const premium = planProduct({ id: "premium" });

		const targeted = buildContext({
			existing: [proOnA, seatsOnB],
			opening: [{ fullProduct: premium }],
			stripeSubscriptionScope: scopeOver({ customerProducts: [proOnA] }),
		});
		expect(
			operationsFor({ billingContext: targeted, undeclared: "end" }),
		).toEqual(["expire:cus_prod_pro", "insert:premium@now"]);

		const untargeted = buildContext({
			existing: [proOnA, seatsOnB],
			opening: [{ fullProduct: premium }],
		});
		expect(
			operationsFor({ billingContext: untargeted, undeclared: "end" }),
		).toEqual([
			"expire:cus_prod_pro",
			"expire:cus_prod_seats",
			"insert:premium@now",
		]);
	});

	test("the same plan listed across consecutive phases is one segment", () => {
		const billingContext = buildContext({
			existing: [running({ product: pro })],
			opening: [{ fullProduct: pro }],
			later: [
				{
					startsAt: PHASE_B,
					plans: [{ fullProduct: pro }, { fullProduct: sso }],
				},
			],
		});
		const timeline = setupSetPlansTimeline({
			ctx,
			billingContext,
			params: { undeclared_plans: "end" },
		});
		expect(
			timeline.desired.segments.map(
				({ planId, startsAt, endsAt }) =>
					`${planId}:${momentName(startsAt)}-${momentName(endsAt)}`,
			),
		).toEqual(["pro:now-never", "sso:B-never"]);
		expect(describeOperations(timeline.diff)).toEqual(["insert:sso@B"]);
	});
});
