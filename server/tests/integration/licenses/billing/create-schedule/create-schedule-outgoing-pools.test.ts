/**
 * Scheduling a customer who ALREADY holds license pools.
 *
 * PR #3295 unblocked the incoming direction (a future phase may offer
 * licenses), but left the outgoing direction rejected: handleCreateScheduleErrors
 * called handleUnsupportedOutgoingLicenseErrors, which threw on any customer
 * product the schedule expires that owns a customer_licenses row — regardless of
 * whether seats were assigned or whether the incoming plan offered the same
 * license.
 *
 * The dashboard's Create Schedule sheet always sends the current plan as phase 0,
 * so resolveCreateScheduleRecurringProducts gives that row the "endsNow" fate:
 * expired immediately, re-inserted as a fresh row. That is the reported flow, and
 * it is the case that tripped the guard.
 *
 * Red (before):
 *  - 1 + 3: 400 "billing.create_schedule does not support license-backed plans yet."
 *  - 2: already passed — the "endsAtPhase" fate updates ended_at without setting
 *    status Expired, so the outgoing guard never saw it.
 *
 * Green (after): create_schedule matches immediate attach. The immediate phase
 * computes customer license transitions, so a pool with a 1:1 successor
 * re-parents onto the new row with its seats intact (1), a pool the incoming
 * plan drops loses its inventory while the assignment history survives (3), and
 * an incoming pool too small for the assigned seats is still rejected by
 * handleLicenseTransitionErrors.
 */
import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	type CreateScheduleParamsV0Input,
	ms,
} from "@autumn/shared";
import {
	getLicenseDbState,
	listLicensePools,
} from "@tests/integration/licenses/licenseTestUtils";
import { expectAssignmentsAnchoredToParent } from "@tests/integration/licenses/utils/expectAssignmentsAnchoredToParent";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const INCLUDED_SEATS = 2;

/** Two plans in one group so a phase plan replaces the other, plus the seat
 * license they may each link. `offersLicense` decides which parents link it. */
const buildPlans = ({ prefix }: { prefix: string }) => {
	const parentGroup = `${prefix}-parent`;

	const currentPlan = products.base({
		id: `${prefix}-current`,
		group: parentGroup,
		items: [items.monthlyPrice({ price: 250 }), items.dashboard()],
	});
	const nextPlan = products.base({
		id: `${prefix}-next`,
		group: parentGroup,
		items: [items.monthlyPrice({ price: 100 }), items.dashboard()],
	});
	const seat = products.base({
		id: `${prefix}-seat`,
		group: `${prefix}-seat-licenses`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	return { currentPlan, nextPlan, seat };
};

test.concurrent(
	`${chalk.yellowBright("create-schedule outgoing pools: schedules a next phase while the customer holds an assigned seat")}`,
	async () => {
		const customerId = "cs-pools-reparent";
		const { currentPlan, nextPlan, seat } = buildPlans({ prefix: "csp-re" });

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [currentPlan, nextPlan, seat] }),
			],
			actions: [
				// Both parents offer the same seat license, so the pool has a 1:1
				// successor on every phase.
				s.licenses.link({
					parentProductId: currentPlan.id,
					licenseProductId: seat.id,
					included: INCLUDED_SEATS,
				}),
				s.licenses.link({
					parentProductId: nextPlan.id,
					licenseProductId: seat.id,
					included: INCLUDED_SEATS,
				}),
				s.billing.attach({ productId: currentPlan.id }),
				s.licenses.assign({ licenseProductId: seat.id, entityIndex: 0 }),
			],
		});

		await autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: currentPlan.id }] },
				{
					starts_at: Date.now() + ms.months(1),
					plans: [{ plan_id: nextPlan.id }],
				},
			],
		});

		// The immediate phase expired the old row and inserted a new one; the
		// seat must follow the pool onto it.
		await expectAssignmentsAnchoredToParent({
			ctx,
			customerId,
			parentPlanId: currentPlan.id,
			count: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule outgoing pools: a future-phase-only schedule leaves the live pool anchored")}`,
	async () => {
		const customerId = "cs-pools-future";
		const { currentPlan, nextPlan, seat } = buildPlans({ prefix: "csp-fu" });
		const addon = products.base({
			id: "csp-fu-addon",
			group: "csp-fu-addon-group",
			items: [items.monthlyPrice({ price: 10 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [currentPlan, nextPlan, seat, addon] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: currentPlan.id,
					licenseProductId: seat.id,
					included: INCLUDED_SEATS,
				}),
				s.licenses.link({
					parentProductId: nextPlan.id,
					licenseProductId: seat.id,
					included: INCLUDED_SEATS,
				}),
				s.billing.attach({ productId: currentPlan.id }),
				s.licenses.assign({ licenseProductId: seat.id, entityIndex: 0 }),
			],
		});

		// The opening phase claims an unrelated group, so the licensed plan is
		// only superseded by the future phase: ended_at is set, status is not.
		await autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: addon.id }] },
				{
					starts_at: Date.now() + ms.months(1),
					plans: [{ plan_id: nextPlan.id }],
				},
			],
		});

		await expectAssignmentsAnchoredToParent({
			ctx,
			customerId,
			parentPlanId: currentPlan.id,
			count: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule outgoing pools: an immediate phase dropping the license retires the seat")}`,
	async () => {
		const customerId = "cs-pools-dropped";
		const { currentPlan, nextPlan, seat } = buildPlans({ prefix: "csp-dr" });

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [currentPlan, nextPlan, seat] }),
			],
			actions: [
				// Only the current plan links the seat, so nextPlan drops it.
				s.licenses.link({
					parentProductId: currentPlan.id,
					licenseProductId: seat.id,
					included: INCLUDED_SEATS,
				}),
				s.billing.attach({ productId: currentPlan.id }),
				s.licenses.assign({ licenseProductId: seat.id, entityIndex: 0 }),
			],
		});

		await autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: nextPlan.id }] },
				{
					starts_at: Date.now() + ms.months(1),
					plans: [{ plan_id: currentPlan.id }],
				},
			],
		});

		// Attach parity: the dropped pool follows its expired parent out of
		// inventory instead of erroring, and the assignment row is preserved.
		const pools = await listLicensePools({ autumn: autumnV2_3, customerId });
		expect(pools).toHaveLength(0);

		const { assignments } = await getLicenseDbState({
			db: ctx.db,
			customerId,
		});
		expect(assignments).toHaveLength(1);

		const check = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.allowed).toBe(false);
	},
);
