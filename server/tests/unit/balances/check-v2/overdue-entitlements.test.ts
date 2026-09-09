import { expect, mock, test } from "bun:test";
import {
	ApiVersionClass,
	CusProductStatus,
	FeatureType,
	type FullSubject,
	fullCustomerToFullSubject,
	InsufficientBalanceError,
	LATEST_VERSION,
	OrgConfigSchema,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import Redis from "ioredis";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

let cachedSubject: FullSubject;
const track = mock(async () => ({ customer_id: "cus_test", balance: null }));
await mockModuleWithRestore(
	"@/internal/balances/track/v3/runTrackV3.js",
	() => ({ runTrackV3: track }),
);
await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/index.js",
	() => ({
		getOrSetCachedPartialFullSubject: async () => cachedSubject,
	}),
);
await mockModuleWithRestore(
	"@/internal/balances/autoTopUp/triggerAutoTopUp.js",
	() => ({
		triggerAutoTopUp: async () => {},
	}),
);

const { getCheckDataV2 } = await import(
	"@/internal/balances/check/getCheckDataV2.js"
);
const { getCheckResponseV2 } = await import(
	"@/internal/balances/check/getCheckResponseV2.js"
);
const { runCheckWithTrackV2 } = await import(
	"@/internal/balances/check/runCheckWithTrackV2.js"
);
const { prepareFeatureDeductionV2 } = await import(
	"@/internal/balances/utils/deductionV2/prepareFeatureDeductionV2.js"
);
const { executeRedisDeductionV2 } = await import(
	"@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js"
);
const { deductionToTrackResponseV2 } = await import(
	"@/internal/balances/utils/deductionV2/deductionToTrackResponseV2.js"
);

const createPlan = ({
	id = "overdue",
	status = CusProductStatus.PastDue,
	amount = 100,
	featureType = FeatureType.Metered,
	unlimited = false,
} = {}) => {
	const entitlement = customerEntitlements.create({
		id: `${id}_balance`,
		customerProductId: id,
		featureId: "messages",
		featureName: "Messages",
		featureType,
		allowance: amount,
		balance: amount,
		usageAllowed: false,
	});
	entitlement.unlimited = unlimited;
	const plan = customerProducts.create({
		id,
		productId: id,
		status,
		customerEntitlements: [entitlement],
	});
	return plan;
};

const setup = ({ blocked = true, plans = [createPlan()] } = {}) => {
	cachedSubject = fullCustomerToFullSubject({
		fullCustomer: customers.create({ customerProducts: plans }),
	});
	const feature = plans[0].customer_entitlements[0].entitlement.feature;
	const ctx = contexts.create({ features: [feature] });
	ctx.org.config = OrgConfigSchema.parse({
		block_overdue_entitlements: blocked,
		include_past_due: !blocked,
	});
	ctx.apiVersion = new ApiVersionClass(LATEST_VERSION);
	ctx.expand = [];
	ctx.timestamp = Date.now();
	return { ctx, feature, fullSubject: cachedSubject };
};

test("overdue access: org default and status preserve normal limits", async () => {
	for (const [blocked, status, allowed] of [
		[false, CusProductStatus.PastDue, true],
		[true, CusProductStatus.Active, true],
		[true, CusProductStatus.PastDue, false],
	] as const) {
		const { ctx } = setup({ blocked, plans: [createPlan({ status })] });
		const checkData = await getCheckDataV2({
			ctx,
			body: { customer_id: "cus_test", feature_id: "messages" },
			requiredBalance: 1,
		});
		const response = await getCheckResponseV2({
			ctx,
			checkData,
			requiredBalance: 1,
		});
		expect(response).toMatchObject({ allowed, balance: { remaining: 100 } });
		expect(
			(await getCheckResponseV2({ ctx, checkData, requiredBalance: 101 }))
				.allowed,
		).toBe(false);
	}
});

test("overdue access: cancellation protection does not grant access", async () => {
	const plan = createPlan();
	plan.product.config.ignore_past_due = true;
	const { ctx } = setup({ plans: [plan] });
	const checkData = await getCheckDataV2({
		ctx,
		body: { customer_id: "cus_test", feature_id: "messages" },
		requiredBalance: 1,
	});
	expect(
		await getCheckResponseV2({ ctx, checkData, requiredBalance: 1 }),
	).toMatchObject({ allowed: false, balance: { remaining: 100 } });
});

test("overdue access: blocked flags and unlimited grants remain visible without granting access", async () => {
	for (const plan of [
		createPlan({ featureType: FeatureType.Boolean }),
		createPlan({ unlimited: true }),
	]) {
		const { ctx } = setup({ plans: [plan] });
		const checkData = await getCheckDataV2({
			ctx,
			body: { customer_id: "cus_test", feature_id: "messages" },
			requiredBalance: 1,
		});
		const response = await getCheckResponseV2({
			ctx,
			checkData,
			requiredBalance: 1,
		});
		expect(response.allowed).toBe(false);
		if (plan.customer_entitlements[0].unlimited)
			expect(response.balance?.unlimited).toBe(true);
		else expect(response.flag?.feature_id).toBe("messages");
	}
});

test("overdue access: mixed grants evaluate and deduct only eligible balances; direct track keeps both", async () => {
	const { ctx, feature, fullSubject } = setup({
		plans: [
			createPlan(),
			createPlan({ id: "active", status: CusProductStatus.Active, amount: 5 }),
		],
	});
	const checkData = await getCheckDataV2({
		ctx,
		body: { customer_id: "cus_test", feature_id: "messages" },
		requiredBalance: 6,
	});
	expect(
		await getCheckResponseV2({ ctx, checkData, requiredBalance: 6 }),
	).toMatchObject({ allowed: false, balance: { remaining: 105 } });
	expect(
		(await getCheckResponseV2({ ctx, checkData, requiredBalance: 5 })).allowed,
	).toBe(true);
	const deduction = { feature, deduction: 3 };
	const checked = prepareFeatureDeductionV2({
		ctx,
		fullSubject,
		deduction: { ...deduction, enforceOverdueBlock: true },
	});
	expect(
		checked.customerEntitlementDeductions.map(
			(entry) => entry.customer_entitlement_id,
		),
	).toEqual(["active_balance"]);
	const tracked = prepareFeatureDeductionV2({ ctx, fullSubject, deduction });
	expect(tracked.customerEntitlementDeductions).toHaveLength(2);
	expect(fullSubject.customer_products).toHaveLength(2);
});

test("overdue access: denied send-event and lock preserve the visible balance and cannot no-op successfully", async () => {
	const { ctx, feature, fullSubject } = setup();
	const checkData = await getCheckDataV2({
		ctx,
		body: { customer_id: "cus_test", feature_id: "messages" },
		requiredBalance: 1,
	});
	for (const requiredBalance of [0, 1]) {
		for (const mode of [
			{ send_event: true },
			{
				lock: {
					enabled: true as const,
					lock_id: "lock_test",
					hashed_key: "lock_test_hash",
				},
			},
		]) {
			const response = await runCheckWithTrackV2({
				ctx,
				checkData,
				requiredBalance,
				body: { customer_id: "cus_test", feature_id: "messages", ...mode },
			});
			expect(response).toMatchObject({
				allowed: false,
				balance: { remaining: 100 },
			});
		}
	}
	expect(() =>
		prepareFeatureDeductionV2({
			ctx,
			fullSubject,
			deduction: { feature, deduction: 1, enforceOverdueBlock: true },
		}),
	).toThrow(InsufficientBalanceError);
	expect(
		fullSubject.customer_products[0].customer_entitlements[0].balance,
	).toBe(100);
	expect(track).not.toHaveBeenCalled();
});

test("overdue access: zero usage without an entitlement is unchanged", async () => {
	for (const blocked of [false, true]) {
		const { ctx, feature, fullSubject } = setup({ blocked });
		fullSubject.customer_products = [];
		const checkData = await getCheckDataV2({
			ctx,
			body: { customer_id: "cus_test", feature_id: "messages" },
			requiredBalance: 0,
		});
		expect(
			await runCheckWithTrackV2({
				ctx,
				checkData,
				requiredBalance: 0,
				body: {
					customer_id: "cus_test",
					feature_id: "messages",
					send_event: true,
				},
			}),
		).toMatchObject({ allowed: true });
		expect(() =>
			prepareFeatureDeductionV2({
				ctx,
				fullSubject,
				deduction: { feature, deduction: 0, enforceOverdueBlock: true },
			}),
		).not.toThrow();
	}
});

test("overdue access: credit fallback and tracked responses select eligible funding", async () => {
	const activePlan = createPlan({
		id: "active",
		status: CusProductStatus.Active,
		amount: 5,
	});
	const { ctx, feature, fullSubject } = setup({ plans: [activePlan] });
	const creditEntitlement = customerEntitlements.create({
		id: "credit_balance",
		customerProductId: "credit_plan",
		featureId: "credits",
		featureName: "Credits",
		featureType: FeatureType.CreditSystem,
		allowance: 100,
		balance: 100,
		usageAllowed: false,
		featureConfig: {
			schema: [{ metered_feature_id: "messages", credit_amount: 5 }],
		},
	});
	creditEntitlement.unlimited = true;
	const creditPlan = customerProducts.create({
		id: "credit_plan",
		productId: "credit_plan",
		status: CusProductStatus.PastDue,
		customerEntitlements: [creditEntitlement],
	});
	fullSubject.customer_products.push(creditPlan);
	ctx.features.push(creditEntitlement.entitlement.feature);
	const body = { customer_id: "cus_test", feature_id: "messages" };
	const blockedCreditCheck = await getCheckDataV2({
		ctx,
		body,
		requiredBalance: 6,
	});
	expect(
		(
			await getCheckResponseV2({
				ctx,
				checkData: blockedCreditCheck,
				requiredBalance: 6,
			})
		).allowed,
	).toBe(false);
	activePlan.customer_entitlements[0].balance = 2;
	const response = await deductionToTrackResponseV2({
		ctx,
		fullSubject,
		featureDeductions: [{ feature, deduction: 3, enforceOverdueBlock: true }],
		updates: {
			active_balance: {
				balance: 2,
				additional_balance: 0,
				entities: {},
				adjustment: 0,
				deducted: 3,
			},
		},
	});
	expect(response.balance).toMatchObject({
		feature_id: "messages",
		remaining: 2,
	});

	activePlan.status = CusProductStatus.PastDue;
	creditEntitlement.unlimited = false;
	const allBlockedCheck = await getCheckDataV2({
		ctx,
		body,
		requiredBalance: 1,
	});
	expect(
		await getCheckResponseV2({
			ctx,
			checkData: allBlockedCheck,
			requiredBalance: 1,
		}),
	).toMatchObject({
		allowed: false,
		required_balance: 1,
		balance: { feature_id: "messages", remaining: 2 },
	});
	activePlan.customer_entitlements = [];
	creditEntitlement.entitlement.feature_override = {
		schema: [{ metered_feature_id: "messages", credit_amount: 7 }],
	};
	const overriddenCreditCheck = await getCheckDataV2({
		ctx,
		body,
		requiredBalance: 4,
	});
	for (const response of [
		await getCheckResponseV2({
			ctx,
			checkData: overriddenCreditCheck,
			requiredBalance: 4,
		}),
		await runCheckWithTrackV2({
			ctx,
			checkData: overriddenCreditCheck,
			requiredBalance: 4,
			body: { ...body, send_event: true },
		}),
	]) {
		expect(response).toMatchObject({
			allowed: false,
			required_balance: 28,
			balance: { feature_id: "credits", remaining: 100 },
		});
	}
});

test("overdue access: subject refresh rechecks eligibility before retrying a deduction", async () => {
	const { ctx, feature, fullSubject } = setup({
		plans: [createPlan({ status: CusProductStatus.Active })],
	});
	fullSubject.subjectViewEpoch = 1;
	const refreshedSubject = structuredClone(fullSubject);
	refreshedSubject.subjectViewEpoch = 2;
	refreshedSubject.customer_products[0].status = CusProductStatus.PastDue;
	const deduct = mock(async () =>
		JSON.stringify({ error: "SUBJECT_VIEW_CHANGED" }),
	);
	const redis = new Redis({ lazyConnect: true });
	redis.status = "ready";
	redis.deductFromSubjectBalances = deduct;
	ctx.redisV2 = redis;
	await expect(
		executeRedisDeductionV2({
			ctx,
			fullSubject,
			redisInstance: redis,
			expectedSubjectViewEpoch: 1,
			deductions: [{ feature, deduction: 1, enforceOverdueBlock: true }],
			refreshFullSubject: async () => refreshedSubject,
		}),
	).rejects.toBeInstanceOf(InsufficientBalanceError);
	expect(deduct).toHaveBeenCalledTimes(1);
});

test("overdue access: rejected lock deductions release the claim; unknown failures retain it", async () => {
	const { ctx } = setup();
	await mockModuleWithRestore(
		"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
		() => ({ getOrSetCachedFullSubject: async () => cachedSubject }),
	);
	const releaseClaim = mock(async () => {});
	await mockModuleWithRestore(
		"@/internal/balances/utils/lockV2/releaseLockClaimMarker.js",
		() => ({ releaseLockClaimMarker: releaseClaim }),
	);
	const { RedisDeductionError, RedisDeductionErrorCode } = await import(
		"@/internal/balances/utils/types/redisDeductionError.js"
	);
	const { runFinalizeLockV2 } = await import(
		"@/internal/balances/finalizeLock/runFinalizeLockV2.js"
	);
	let deductionError: Error;
	await mockModuleWithRestore(
		"@/internal/balances/finalizeLock/runRedisFinalizeLockV2.js",
		() => ({
			runRedisFinalizeLockV2: async () => {
				throw deductionError;
			},
		}),
	);
	for (const [error, releases] of [
		[new InsufficientBalanceError({ featureId: "messages", value: 5 }), true],
		[
			new RedisDeductionError({
				code: RedisDeductionErrorCode.InsufficientBalance,
				message: "Redis deduction failed: INSUFFICIENT_BALANCE",
			}),
			true,
		],
		[
			new Error("INSUFFICIENT_BALANCE|featureId:messages|value:5|remaining:0"),
			true,
		],
		[new Error("unexpected failure"), false],
	] as const) {
		releaseClaim.mockClear();
		deductionError = error;
		await expect(
			runFinalizeLockV2({
				ctx,
				params: { lock_id: "lock_test", action: "confirm", override_value: 15 },
				receipt: {
					customer_id: "cus_test",
					feature_id: "messages",
					overrideLockValue: 10,
					items: [],
				},
				lockReceiptKey: "lock_test",
				claimed: true,
				lockRedisInstance: new Redis({ lazyConnect: true }),
			}),
		).rejects.toBe(error);
		expect(releaseClaim).toHaveBeenCalledTimes(releases ? 1 : 0);
	}
});
