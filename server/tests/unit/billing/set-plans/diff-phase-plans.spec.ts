/** Preview plan statuses compare each phase with what the customer's saved state holds at its start. */

import { describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	ms,
} from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildSetPlansPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPhaseCustomers";
import { diffPhasePlans } from "@/internal/billing/v2/actions/setPlans/preview/diffPhasePlans";
import { setPlansPhasePlans } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPhasePlans";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import {
	makeAutumnBillingPlan,
	makeUpdate,
} from "../billing-change-response/helpers/makeAutumnBillingPlan";
import { makeFullCustomer } from "../billing-change-response/helpers/makeFullCustomer";

const NOW = 1_710_000_000_000;
const PHASE_TWO = NOW + ms.days(30);
const ctx = { features: [] } as unknown as AutumnContext;

const planRow = ({
	id,
	planId,
	amount = 20,
	version = 1,
	internalEntityId,
	status = CusProductStatus.Active,
	startsAt = NOW - ms.days(1),
	endedAt = null,
}: {
	id: string;
	planId: string;
	amount?: number;
	version?: number;
	internalEntityId?: string;
	status?: CusProductStatus;
	startsAt?: number;
	endedAt?: number | null;
}): FullCusProduct => {
	const price = prices.buildFixed({
		overrides: { id: `price_${planId}_v${version}` },
		configOverrides: { amount },
	});
	return {
		...customerProducts.create({
			id,
			productId: planId,
			product: products.createFull({ id: planId, name: planId }),
			customerPrices: [prices.createCustomer({ price, customerProductId: id })],
			internalEntityId,
			status,
			startsAt,
			endedAt,
		}),
		internal_product_id: `internal_${planId}_v${version}`,
	};
};

const statuses = (
	diffs: {
		status: string;
		before: FullCusProduct | null;
		after: FullCusProduct | null;
	}[],
) =>
	diffs.map(({ status, before, after }) => {
		const customerProduct = after ?? before;
		return [
			status,
			customerProduct?.product_id,
			customerProduct?.internal_entity_id ?? null,
		];
	});

const previewStatuses = ({
	originalFullCustomer,
	autumnBillingPlan,
	phases,
}: {
	originalFullCustomer: FullCustomer;
	autumnBillingPlan: AutumnBillingPlan;
	phases: SchedulePhasePlan[];
}) =>
	setPlansPhasePlans({
		phases,
		phaseCustomers: buildSetPlansPhaseCustomers({
			ctx,
			fullCustomer: originalFullCustomer,
			autumnBillingPlan,
			phases,
		}),
		originalFullCustomer,
		features: [],
		creditLineItems: [],
		currency: "usd",
	}).map((phasePlans) => phasePlans.map((plan) => [plan.status, plan.plan_id]));

const proThenPremium = ({
	free,
	proContinues = false,
}: {
	free: FullCusProduct;
	proContinues?: boolean;
}) => {
	const pro = planRow({
		id: "cp_pro",
		planId: "pro",
		startsAt: NOW,
		endedAt: proContinues ? null : PHASE_TWO,
	});
	const premium = planRow({
		id: "cp_premium",
		planId: "premium",
		status: CusProductStatus.Scheduled,
		startsAt: PHASE_TWO,
	});
	return {
		autumnBillingPlan: makeAutumnBillingPlan({
			inserts: [pro, premium],
			updates: [
				makeUpdate({
					customerProduct: free,
					updates: { status: CusProductStatus.Expired, ended_at: NOW },
				}),
			],
		}),
		phases: [
			{ startsAt: NOW, customerProductIds: [pro.id] },
			{ startsAt: PHASE_TWO, customerProductIds: [premium.id] },
		],
	};
};

describe("diffPhasePlans", () => {
	test("a plan added to the first phase only starts there and is absent later", () => {
		const free = planRow({
			id: "cp_free",
			planId: "free",
			amount: 0,
			endedAt: PHASE_TWO,
		});
		const enterprise = planRow({
			id: "cp_enterprise",
			planId: "enterprise",
			status: CusProductStatus.Scheduled,
			startsAt: PHASE_TWO,
		});
		const pro = planRow({
			id: "cp_pro",
			planId: "pro",
			startsAt: NOW,
			endedAt: PHASE_TWO,
		});

		expect(
			previewStatuses({
				originalFullCustomer: makeFullCustomer({
					customerProducts: [free, enterprise],
				}),
				autumnBillingPlan: makeAutumnBillingPlan({ inserts: [pro] }),
				phases: [
					{ startsAt: NOW, customerProductIds: [pro.id] },
					{ startsAt: PHASE_TWO, customerProductIds: [enterprise.id] },
				],
			}),
		).toEqual([
			[
				["starts", "pro"],
				["kept", "free"],
			],
			[["kept", "enterprise"]],
		]);
	});

	test("a plan removed from a saved later phase ends in that phase", () => {
		const enterprise = planRow({
			id: "cp_enterprise",
			planId: "enterprise",
			status: CusProductStatus.Scheduled,
			startsAt: PHASE_TWO,
		});
		const addOn = planRow({
			id: "cp_add_on",
			planId: "add_on",
			status: CusProductStatus.Scheduled,
			startsAt: PHASE_TWO,
		});

		expect(
			previewStatuses({
				originalFullCustomer: makeFullCustomer({
					customerProducts: [enterprise, addOn],
				}),
				autumnBillingPlan: makeAutumnBillingPlan({ deletes: [addOn] }),
				phases: [
					{ startsAt: NOW, customerProductIds: [] },
					{ startsAt: PHASE_TWO, customerProductIds: [enterprise.id] },
				],
			}),
		).toEqual([
			[],
			[
				["ends", "add_on"],
				["kept", "enterprise"],
			],
		]);
	});

	test("editing a plan in the first phase keeps the saved row that takes over in the next", () => {
		const currentEnterprise = planRow({
			id: "cp_enterprise_now",
			planId: "enterprise",
			endedAt: PHASE_TWO,
		});
		const scheduledEnterprise = planRow({
			id: "cp_enterprise_next",
			planId: "enterprise",
			status: CusProductStatus.Scheduled,
			startsAt: PHASE_TWO,
		});
		const editedEnterprise = planRow({
			id: "cp_enterprise_edited",
			planId: "enterprise",
			amount: 99,
			startsAt: NOW,
			endedAt: PHASE_TWO,
		});

		expect(
			previewStatuses({
				originalFullCustomer: makeFullCustomer({
					customerProducts: [currentEnterprise, scheduledEnterprise],
				}),
				autumnBillingPlan: makeAutumnBillingPlan({
					inserts: [editedEnterprise],
					updates: [
						makeUpdate({
							customerProduct: currentEnterprise,
							updates: { status: CusProductStatus.Expired, ended_at: NOW },
						}),
					],
				}),
				phases: [
					{ startsAt: NOW, customerProductIds: [editedEnterprise.id] },
					{
						startsAt: PHASE_TWO,
						customerProductIds: [scheduledEnterprise.id],
					},
				],
			}),
		).toEqual([[["updated", "enterprise"]], [["kept", "enterprise"]]]);
	});

	test("a new version of the same plan is updated", () => {
		expect(
			statuses(
				diffPhasePlans({
					features: [],
					before: [planRow({ id: "cp_pro_v1", planId: "pro", version: 1 })],
					after: [planRow({ id: "cp_pro_v2", planId: "pro", version: 2 })],
				}),
			),
		).toEqual([["updated", "pro", null]]);
	});

	test("an untouched plan is kept", () => {
		const pro = planRow({ id: "cp_pro", planId: "pro" });

		expect(
			statuses(diffPhasePlans({ features: [], before: [pro], after: [pro] })),
		).toEqual([["kept", "pro", null]]);
	});

	test("the same plan on two entities gets a status per entity", () => {
		const proOnEntityA = planRow({
			id: "cp_pro_a",
			planId: "pro",
			internalEntityId: "ent_a",
		});
		const proOnEntityB = planRow({
			id: "cp_pro_b",
			planId: "pro",
			internalEntityId: "ent_b",
		});
		const repricedProOnEntityB = planRow({
			id: "cp_pro_b_new",
			planId: "pro",
			amount: 50,
			internalEntityId: "ent_b",
		});

		expect(
			statuses(
				diffPhasePlans({
					features: [],
					before: [proOnEntityA, proOnEntityB],
					after: [proOnEntityA, repricedProOnEntityB],
				}),
			),
		).toEqual([
			["updated", "pro", "ent_b"],
			["kept", "pro", "ent_a"],
		]);
	});

	test("replacing a plan with another in the same group ends one and starts the other", () => {
		expect(
			statuses(
				diffPhasePlans({
					features: [],
					before: [planRow({ id: "cp_basic", planId: "basic" })],
					after: [planRow({ id: "cp_premium", planId: "premium" })],
				}),
			),
		).toEqual([
			["starts", "premium", null],
			["ends", "basic", null],
		]);
	});

	test("a free plan left out of a newly added phase is not listed as ending", () => {
		const free = planRow({ id: "cp_free", planId: "free", amount: 0 });
		const pro = planRow({
			id: "cp_pro",
			planId: "pro",
			status: CusProductStatus.Scheduled,
			startsAt: PHASE_TWO,
		});

		expect(
			previewStatuses({
				originalFullCustomer: makeFullCustomer({ customerProducts: [free] }),
				autumnBillingPlan: makeAutumnBillingPlan({
					inserts: [pro],
					updates: [
						makeUpdate({
							customerProduct: free,
							updates: { ended_at: PHASE_TWO },
						}),
					],
				}),
				phases: [
					{ startsAt: NOW, customerProductIds: [] },
					{ startsAt: PHASE_TWO, customerProductIds: [pro.id] },
				],
			}),
		).toEqual([[["kept", "free"]], [["starts", "pro"]]]);
	});

	test("a newly added phase only lists the plans it starts", () => {
		const free = planRow({ id: "cp_free", planId: "free", amount: 0 });
		const { autumnBillingPlan, phases } = proThenPremium({ free });

		expect(
			previewStatuses({
				originalFullCustomer: makeFullCustomer({ customerProducts: [free] }),
				autumnBillingPlan,
				phases,
			}),
		).toEqual([
			[
				["starts", "pro"],
				["ends", "free"],
			],
			[["starts", "premium"]],
		]);
	});

	test("a newly added phase re-listing a plan keeps it", () => {
		const free = planRow({ id: "cp_free", planId: "free", amount: 0 });
		const { autumnBillingPlan, phases } = proThenPremium({
			free,
			proContinues: true,
		});

		expect(
			previewStatuses({
				originalFullCustomer: makeFullCustomer({ customerProducts: [free] }),
				autumnBillingPlan,
				phases,
			}),
		).toEqual([
			[
				["starts", "pro"],
				["ends", "free"],
			],
			[
				["starts", "premium"],
				["kept", "pro"],
			],
		]);
	});

	test("a newly added phase with a changed version of the previous phase's plan creates it", () => {
		const proNow = planRow({ id: "cp_pro_now", planId: "pro" });
		const customPro = planRow({
			id: "cp_pro_custom",
			planId: "pro",
			amount: 40,
			status: CusProductStatus.Scheduled,
			startsAt: PHASE_TWO,
		});

		expect(
			previewStatuses({
				originalFullCustomer: makeFullCustomer({ customerProducts: [proNow] }),
				autumnBillingPlan: makeAutumnBillingPlan({
					inserts: [customPro],
					updates: [
						makeUpdate({
							customerProduct: proNow,
							updates: { ended_at: PHASE_TWO },
						}),
					],
				}),
				phases: [
					{ startsAt: NOW, customerProductIds: [proNow.id] },
					{ startsAt: PHASE_TWO, customerProductIds: [customPro.id] },
				],
			}),
		).toEqual([[["kept", "pro"]], [["starts", "pro"]]]);
	});

	test("a custom plan re-sent with its stored $0 base price is kept", () => {
		const customPlan = {
			...planRow({ id: "cp_custom", planId: "custom", amount: 0 }),
			is_custom: true,
		};
		const resentCustomPlan = {
			...planRow({ id: "cp_custom_resent", planId: "custom", amount: 0 }),
			is_custom: true,
		};

		expect(
			statuses(
				diffPhasePlans({
					features: [],
					before: [customPlan],
					after: [resentCustomPlan],
				}),
			),
		).toEqual([["kept", "custom", null]]);
	});
});
