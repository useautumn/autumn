import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	BillingVersion,
	type CreateScheduleBillingContext,
	CusProductStatus,
	EntInterval,
	type Entity,
	type FeatureOptions,
	FeatureUsageType,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	type FullProduct,
	ms,
	RolloverExpiryDurationType,
	type SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { entities } from "@tests/utils/fixtures/db/entities";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { features } from "@tests/utils/fixtures/db/features";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { rollovers } from "@tests/utils/fixtures/db/rollovers";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildSetPlansPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPhaseCustomers";
import { setPlansPhaseBalanceChanges } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPhaseBalanceChanges";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import {
	makeAutumnBillingPlan,
	makeUpdate,
} from "../billing-change-response/helpers/makeAutumnBillingPlan";
import { computeSetPlansPlanFromContext } from "./setPlansTimelineHelpers";

const NOW = 1_800_000_000_000;
const PHASE_TWO = NOW + ms.days(30);
const PHASE_THREE = NOW + ms.days(60);
const NEXT_YEAR = NOW + ms.days(365);

const CONSUMABLE = { usage_type: FeatureUsageType.Single };
const ALLOCATED = { usage_type: FeatureUsageType.Continuous };

const wordsFeature = features.create({
	id: "words",
	name: "Words",
	config: CONSUMABLE,
});
const seatsFeature = features.create({
	id: "seats",
	name: "Seats",
	config: ALLOCATED,
});

const ctx = {
	...contexts.create({ features: [wordsFeature, seatsFeature] }),
	expand: [],
} as unknown as AutumnContext;

const wordsBalance = ({
	customerProductId,
	allowance,
	usage = 0,
}: {
	customerProductId: string;
	allowance: number;
	usage?: number;
}) =>
	customerEntitlements.create({
		entitlementId: `ent_words_${customerProductId}`,
		featureId: "words",
		featureName: "Words",
		featureConfig: CONSUMABLE,
		interval: EntInterval.Month,
		allowance,
		balance: allowance - usage,
		customerProductId,
	});

const seatsBalance = ({
	customerProductId,
	allowance,
	usage = 0,
}: {
	customerProductId: string;
	allowance: number;
	usage?: number;
}) =>
	customerEntitlements.create({
		entitlementId: `ent_seats_${customerProductId}`,
		featureId: "seats",
		featureName: "Seats",
		featureConfig: ALLOCATED,
		allowance,
		balance: allowance - usage,
		customerProductId,
	});

const unlimitedWords = ({
	customerProductId,
}: {
	customerProductId: string;
}): FullCustomerEntitlement => {
	const balance = wordsBalance({ customerProductId, allowance: 0 });
	return {
		...balance,
		unlimited: true,
		entitlement: {
			...balance.entitlement,
			allowance_type: AllowanceType.Unlimited,
		},
	};
};

const planRow = ({
	planId,
	rowId = `cp_${planId}`,
	balances,
	status = CusProductStatus.Active,
	startsAt = NOW - ms.days(10),
	endedAt,
	isAddOn = false,
	options,
	extraPrices = [],
	internalEntityId,
}: {
	planId: string;
	rowId?: string;
	balances: (customerProductId: string) => FullCustomerEntitlement[];
	status?: CusProductStatus;
	startsAt?: number;
	endedAt?: number;
	isAddOn?: boolean;
	options?: FeatureOptions[];
	extraPrices?: ReturnType<typeof prices.createPrepaid>[];
	internalEntityId?: string;
}): FullCusProduct => {
	const product = products.createFull({
		id: planId,
		isAddOn,
		prices: [prices.createFixed({ id: `price_${planId}` }), ...extraPrices],
	});
	return customerProducts.create({
		id: rowId,
		productId: planId,
		product,
		status,
		startsAt,
		endedAt,
		options,
		internalEntityId,
		// A running paid plan is billed on a Stripe subscription.
		subscriptionIds: status === CusProductStatus.Scheduled ? [] : ["sub_live"],
		customerEntitlements: balances(rowId),
		customerPrices: product.prices.map((price) =>
			prices.createCustomer({ price, customerProductId: rowId }),
		),
	});
};

const scheduledRow = (params: Parameters<typeof planRow>[0]) =>
	planRow({ status: CusProductStatus.Scheduled, ...params });

/** Projects the request's phases from saved rows plus the rows and updates it plans, then diffs balances. */
const previewBalanceChanges = async ({
	current,
	inserts = [],
	endings = [],
	expirations = [],
	phases,
	entity,
	customerEntities = [],
}: {
	current: FullCusProduct[];
	inserts?: FullCusProduct[];
	endings?: { customerProduct: FullCusProduct; endedAt: number }[];
	expirations?: FullCusProduct[];
	phases: SchedulePhasePlan[];
	entity?: Entity;
	customerEntities?: Entity[];
}) => {
	const fullCustomer: FullCustomer = {
		...customers.create({ customerProducts: current }),
		entity,
		entities: customerEntities,
	};
	const phaseCustomers = buildSetPlansPhaseCustomers({
		ctx,
		fullCustomer,
		autumnBillingPlan: makeAutumnBillingPlan({
			inserts,
			updates: [
				...endings.map(({ customerProduct, endedAt }) =>
					makeUpdate({ customerProduct, updates: { ended_at: endedAt } }),
				),
				...expirations.map((customerProduct) =>
					makeUpdate({
						customerProduct,
						updates: { status: CusProductStatus.Expired, ended_at: NOW },
					}),
				),
			],
		}),
		phases,
	});
	return setPlansPhaseBalanceChanges({
		ctx,
		originalFullCustomer: fullCustomer,
		phaseCustomers,
	});
};

const describeChange = ({
	feature_id,
	behavior,
	balance,
	previous_attributes,
}: SetPlansPreviewBalanceChange) =>
	`${feature_id} ${behavior}: ${previous_attributes.granted ?? balance.granted} -> ${balance.granted} granted, ${balance.usage} used`;

const describePhases = (phaseChanges: SetPlansPreviewBalanceChange[][]) =>
	phaseChanges.map((changes) => changes.map(describeChange));

/** A customer on Pro whose next phase moves to a plan given by its product context, run through the real set_plans compute. */
const computeSetPlansBalanceChanges = async ({
	currentRow,
	currentProduct,
	immediateProduct,
	immediateCustomEntitlements = [],
	scheduledProduct,
	scheduledCustomEntitlements = [],
}: {
	currentRow: FullCusProduct;
	currentProduct: FullProduct;
	immediateProduct: FullProduct;
	immediateCustomEntitlements?: FullProduct["entitlements"];
	scheduledProduct?: FullProduct;
	scheduledCustomEntitlements?: FullProduct["entitlements"];
}) => {
	const billing = contexts.createBilling({
		customerProducts: [currentRow],
		fullProducts: [currentProduct],
		currentEpochMs: NOW,
		billingVersion: BillingVersion.V2,
	});
	const billingContext = {
		...billing,
		productContexts: [
			{
				fullProduct: immediateProduct,
				customPrices: [],
				customEnts: immediateCustomEntitlements,
				featureQuantities: [],
				currentCustomerProduct: currentRow,
				fullCustomer: billing.fullCustomer,
			},
		],
		checkoutMode: null,
		billingStartsAt: NOW,
		immediatePhase: {
			starts_at: NOW,
			plans: [{ plan_id: immediateProduct.id }],
		},
		futurePhases: scheduledProduct
			? [{ starts_at: NEXT_YEAR, plans: [{ plan_id: scheduledProduct.id }] }]
			: [],
		scheduledPhaseContexts: scheduledProduct
			? [
					{
						startsAt: NEXT_YEAR,
						endsAt: undefined,
						productContexts: [
							{
								fullProduct: scheduledProduct,
								customPrices: [],
								customEntitlements: scheduledCustomEntitlements,
								featureQuantities: [],
							},
						],
					},
				]
			: [],
	} as unknown as CreateScheduleBillingContext;

	const { autumnBillingPlan, phases } = computeSetPlansPlanFromContext({
		ctx,
		billingContext,
	});
	const phaseCustomers = buildSetPlansPhaseCustomers({
		ctx,
		fullCustomer: billingContext.fullCustomer,
		autumnBillingPlan,
		phases,
	});
	return setPlansPhaseBalanceChanges({
		ctx,
		originalFullCustomer: billingContext.fullCustomer,
		phaseCustomers,
	});
};

const productWithWords = ({
	planId,
	allowance,
	entitlementId = `ent_words_${planId}`,
	isCustom = false,
}: {
	planId: string;
	allowance: number;
	entitlementId?: string;
	isCustom?: boolean;
}) => {
	const words = {
		...entitlements.create({
			id: entitlementId,
			featureId: "words",
			featureName: "Words",
			featureConfig: CONSUMABLE,
			interval: EntInterval.Month,
			allowance,
		}),
		is_custom: isCustom,
	};
	return {
		words,
		product: products.createFull({
			id: planId,
			prices: [prices.createFixed({ id: `price_${planId}` })],
			entitlements: [words],
		}),
	};
};

const proOnWords = ({ allowance }: { allowance: number }) => {
	const { product } = productWithWords({ planId: "pro", allowance });
	const row = customerProducts.create({
		id: "cp_pro",
		productId: "pro",
		product,
		startsAt: NOW - ms.days(10),
		subscriptionIds: ["sub_live"],
		customerEntitlements: [
			wordsBalance({ customerProductId: "cp_pro", allowance }),
		],
		customerPrices: [
			prices.createCustomer({
				price: product.prices[0]!,
				customerProductId: "cp_pro",
			}),
		],
	});
	return { product, row };
};

describe(chalk.yellowBright("setPlansPhaseBalanceChanges"), () => {
	test("(a) a future phase plan customized to double an allowance reads as updated", async () => {
		const pro = proOnWords({ allowance: 1000 });
		const customProYearly = productWithWords({
			planId: "pro_yearly",
			allowance: 2000,
			entitlementId: "ent_words_custom",
			isCustom: true,
		});

		const phaseChanges = await computeSetPlansBalanceChanges({
			currentRow: pro.row,
			currentProduct: pro.product,
			immediateProduct: pro.product,
			scheduledProduct: customProYearly.product,
			scheduledCustomEntitlements: [customProYearly.words],
		});

		expect(describePhases(phaseChanges)).toEqual([
			[],
			["words updated: 1000 -> 2000 granted, 0 used"],
		]);
	});

	test("(b) customizing an existing plan's allowance now reads as updated", async () => {
		const pro = proOnWords({ allowance: 1000 });
		const customPro = productWithWords({
			planId: "pro",
			allowance: 2000,
			entitlementId: "ent_words_custom",
			isCustom: true,
		});

		const phaseChanges = await computeSetPlansBalanceChanges({
			currentRow: pro.row,
			currentProduct: pro.product,
			immediateProduct: customPro.product,
			immediateCustomEntitlements: [customPro.words],
		});

		expect(describePhases(phaseChanges)).toEqual([
			["words updated: 1000 -> 2000 granted, 0 used"],
		]);
	});

	test("(c) a feature a new plan brings reads as added", async () => {
		const pro = planRow({
			planId: "pro",
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 1000 }),
			],
		});
		const seatsAddon = planRow({
			planId: "seats_addon",
			isAddOn: true,
			startsAt: NOW,
			balances: (id) => [seatsBalance({ customerProductId: id, allowance: 5 })],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			inserts: [seatsAddon],
			phases: [{ startsAt: NOW, customerProductIds: [pro.id, seatsAddon.id] }],
		});

		expect(describePhases(phaseChanges)).toEqual([
			["seats added: 0 -> 5 granted, 0 used"],
		]);
	});

	test("(d) a feature whose plan ends reads as removed", async () => {
		const pro = planRow({
			planId: "pro",
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 1000 }),
			],
		});
		const seatsAddon = planRow({
			planId: "seats_addon",
			isAddOn: true,
			balances: (id) => [
				seatsBalance({ customerProductId: id, allowance: 5, usage: 2 }),
			],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro, seatsAddon],
			endings: [{ customerProduct: seatsAddon, endedAt: PHASE_TWO }],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id, seatsAddon.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [] },
			],
		});

		expect(describePhases(phaseChanges)).toEqual([
			[],
			["seats removed: 5 -> 0 granted, 0 used"],
		]);
	});

	test("(e) switching plans keeps allocated usage, which reads as carried", async () => {
		const pro = planRow({
			planId: "pro",
			balances: (id) => [
				seatsBalance({ customerProductId: id, allowance: 5, usage: 3 }),
			],
		});
		const premium = scheduledRow({
			planId: "premium",
			startsAt: PHASE_TWO,
			balances: (id) => [
				seatsBalance({ customerProductId: id, allowance: 10 }),
			],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			inserts: [premium],
			endings: [{ customerProduct: pro, endedAt: PHASE_TWO }],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [premium.id] },
			],
		});

		expect(describePhases(phaseChanges)).toEqual([
			[],
			["seats carried: 5 -> 10 granted, 3 used"],
		]);
	});

	test("(f) switching plans clears consumable usage, which reads as reset", async () => {
		const pro = planRow({
			planId: "pro",
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 1000, usage: 400 }),
			],
		});
		const premium = scheduledRow({
			planId: "premium",
			startsAt: PHASE_TWO,
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 1000 }),
			],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			inserts: [premium],
			endings: [{ customerProduct: pro, endedAt: PHASE_TWO }],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [premium.id] },
			],
		});

		expect(describePhases(phaseChanges)).toEqual([
			[],
			["words reset: 1000 -> 1000 granted, 0 used"],
		]);
	});

	test("(g) limited to unlimited and back both read as updated", async () => {
		const pro = planRow({
			planId: "pro",
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 1000 }),
			],
		});
		const unlimited = scheduledRow({
			planId: "unlimited",
			startsAt: PHASE_TWO,
			endedAt: PHASE_THREE,
			balances: (id) => [unlimitedWords({ customerProductId: id })],
		});
		const team = scheduledRow({
			planId: "team",
			startsAt: PHASE_THREE,
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 500 }),
			],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			inserts: [unlimited, team],
			endings: [{ customerProduct: pro, endedAt: PHASE_TWO }],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [unlimited.id] },
				{ startsAt: PHASE_THREE, customerProductIds: [team.id] },
			],
		});

		expect(
			phaseChanges.map((changes) => changes.map((change) => change.behavior)),
		).toEqual([[], ["updated"], ["updated"]]);
		expect(phaseChanges[1][0]?.balance.unlimited).toBe(true);
		expect(phaseChanges[2][0]?.previous_attributes.unlimited).toBe(true);
		expect(phaseChanges[2][0]?.balance.granted).toBe(500);
	});

	test("(h) a prepaid quantity change reads as updated", async () => {
		const prepaidWords = prices.createPrepaid({
			id: "price_words_prepaid",
			featureId: "words",
			entitlementId: "ent_words_prepaid",
		});
		const prepaidBalance =
			({ quantity }: { quantity: number }) =>
			(customerProductId: string) => {
				const balance = wordsBalance({ customerProductId, allowance: 0 });
				return [
					{
						...balance,
						balance: quantity,
						entitlement_id: "ent_words_prepaid",
						entitlement: { ...balance.entitlement, id: "ent_words_prepaid" },
					},
				];
			};
		const prepaidOptions = (quantity: number): FeatureOptions[] => [
			{ feature_id: "words", internal_feature_id: "internal_words", quantity },
		];
		const pro = planRow({
			planId: "pro",
			balances: prepaidBalance({ quantity: 10 }),
			extraPrices: [prepaidWords],
			options: prepaidOptions(10),
		});
		const resizedPro = planRow({
			planId: "pro",
			rowId: "cp_pro_resized",
			startsAt: NOW,
			balances: prepaidBalance({ quantity: 20 }),
			extraPrices: [prepaidWords],
			options: prepaidOptions(20),
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			inserts: [resizedPro],
			expirations: [pro],
			phases: [{ startsAt: NOW, customerProductIds: [resizedPro.id] }],
		});

		expect(describePhases(phaseChanges)).toEqual([
			["words updated: 10 -> 20 granted, 0 used"],
		]);
	});

	test("(i) another entity's plan change is listed under that entity, apart from the request entity", async () => {
		const entityA = entities.create({ id: "ent_a", featureId: "users" });
		const entityB = entities.create({ id: "ent_b", featureId: "users" });
		const proForA = planRow({
			planId: "pro",
			rowId: "cp_pro_a",
			internalEntityId: entityA.internal_id,
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 1000 }),
			],
		});
		const proForB = planRow({
			planId: "pro",
			rowId: "cp_pro_b",
			internalEntityId: entityB.internal_id,
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 1000 }),
			],
		});
		const premiumForB = scheduledRow({
			planId: "premium",
			rowId: "cp_premium_b",
			startsAt: PHASE_TWO,
			internalEntityId: entityB.internal_id,
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 5000 }),
			],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [proForA, proForB],
			inserts: [premiumForB],
			endings: [{ customerProduct: proForB, endedAt: PHASE_TWO }],
			phases: [
				{ startsAt: NOW, customerProductIds: [proForA.id, proForB.id] },
				{
					startsAt: PHASE_TWO,
					customerProductIds: [proForA.id, premiumForB.id],
				},
			],
			entity: entityA,
			customerEntities: [entityA, entityB],
		});

		expect(describePhases(phaseChanges)).toEqual([
			[],
			["words updated: 1000 -> 5000 granted, 0 used"],
		]);
		expect(phaseChanges[1]?.map((change) => change.entity_id)).toEqual([
			"ent_b",
		]);
	});

	test("(j) a plan unchanged across every phase has no balance changes", async () => {
		const pro = planRow({
			planId: "pro",
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 1000, usage: 400 }),
			],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [pro.id] },
			],
		});

		expect(describePhases(phaseChanges)).toEqual([[], []]);
	});

	test("(k) a scheduled row taking over the same plan and allowance has no balance changes", async () => {
		const pro = planRow({
			planId: "pro",
			balances: (id) => [
				seatsBalance({ customerProductId: id, allowance: 5, usage: 2 }),
			],
		});
		const nextPro = scheduledRow({
			planId: "pro",
			rowId: "cp_pro_next",
			startsAt: PHASE_TWO,
			balances: (id) => [seatsBalance({ customerProductId: id, allowance: 5 })],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			inserts: [nextPro],
			endings: [{ customerProduct: pro, endedAt: PHASE_TWO }],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [nextPro.id] },
			],
		});

		expect(describePhases(phaseChanges)).toEqual([[], []]);
	});

	test("(l) a new future phase that only adds a plan lists only its new features", async () => {
		const pro = planRow({
			planId: "pro",
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 1000, usage: 400 }),
			],
		});
		const seatsAddon = scheduledRow({
			planId: "seats_addon",
			isAddOn: true,
			startsAt: PHASE_TWO,
			balances: (id) => [seatsBalance({ customerProductId: id, allowance: 5 })],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			inserts: [seatsAddon],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [pro.id, seatsAddon.id] },
			],
		});

		expect(describePhases(phaseChanges)).toEqual([
			[],
			["seats added: 0 -> 5 granted, 0 used"],
		]);
	});

	test("(m) rollovers carried into the next phase stay in its granted and remaining balance", async () => {
		const rolloverConfig = {
			max: null,
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		};
		const rolloverWords = ({
			customerProductId,
			allowance,
		}: {
			customerProductId: string;
			allowance: number;
		}) =>
			customerEntitlements.create({
				featureId: "words",
				featureName: "Words",
				featureConfig: CONSUMABLE,
				allowance,
				balance: allowance,
				customerProductId,
				rollover: rolloverConfig,
			});
		const proWords = rolloverWords({
			customerProductId: "cp_pro",
			allowance: 1000,
		});
		proWords.rollovers = [
			rollovers.create({ cusEntId: proWords.id, balance: 300 }),
		];
		const pro = planRow({ planId: "pro", balances: () => [proWords] });
		const premium = scheduledRow({
			planId: "premium",
			startsAt: PHASE_TWO,
			balances: (id) => [
				rolloverWords({ customerProductId: id, allowance: 2000 }),
			],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			inserts: [premium],
			endings: [{ customerProduct: pro, endedAt: PHASE_TWO }],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [premium.id] },
			],
		});

		expect(describePhases(phaseChanges)).toEqual([
			[],
			["words updated: 1300 -> 2300 granted, 0 used"],
		]);
		expect(phaseChanges[1][0]?.balance.remaining).toBe(2300);
		expect(phaseChanges[1][0]?.previous_attributes.remaining).toBe(1300);
	});

	test("(n) each later phase diffs against the phase before it, not today", async () => {
		const pro = planRow({
			planId: "pro",
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 1000 }),
			],
		});
		const premium = scheduledRow({
			planId: "premium",
			startsAt: PHASE_TWO,
			endedAt: PHASE_THREE,
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 2000 }),
			],
		});
		const enterprise = scheduledRow({
			planId: "enterprise",
			startsAt: PHASE_THREE,
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 3000 }),
			],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			inserts: [premium, enterprise],
			endings: [{ customerProduct: pro, endedAt: PHASE_TWO }],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [premium.id] },
				{ startsAt: PHASE_THREE, customerProductIds: [enterprise.id] },
			],
		});

		expect(describePhases(phaseChanges)).toEqual([
			[],
			["words updated: 1000 -> 2000 granted, 0 used"],
			["words updated: 2000 -> 3000 granted, 0 used"],
		]);
	});

	test("(o) a plan that starts its phase trialing still grants its balances", async () => {
		const pro = planRow({
			planId: "pro",
			balances: (id) => [
				wordsBalance({ customerProductId: id, allowance: 1000 }),
			],
		});
		const trialingPremium = {
			...scheduledRow({
				planId: "premium",
				startsAt: PHASE_TWO,
				balances: (id) => [
					wordsBalance({ customerProductId: id, allowance: 2000 }),
				],
			}),
			trial_ends_at: PHASE_TWO + ms.days(14),
		};

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			inserts: [trialingPremium],
			endings: [{ customerProduct: pro, endedAt: PHASE_TWO }],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [trialingPremium.id] },
			],
		});

		expect(describePhases(phaseChanges)).toEqual([
			[],
			["words updated: 1000 -> 2000 granted, 0 used"],
		]);
	});
});
