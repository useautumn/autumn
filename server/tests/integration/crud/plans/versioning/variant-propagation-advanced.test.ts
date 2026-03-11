import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiPlanV1Schema,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnInt = new AutumnInt({ version: ApiVersion.V2_1 });

const planId = "prop_multi";
const group = "prop_group_multi";

const monthlyVariantId = "monthly";
const annualVariantId = "annual";

const monthlyCustomerId = "prop_cus_monthly";
const annualCustomerId = "prop_cus_annual";
const monthlyV2CustomerId = "prop_cus_monthly_v2";
const monthlyV3CustomerId = "prop_cus_monthly_v3";
const annualV3CustomerId = "prop_cus_annual_v3";

const customerIds = [
	monthlyCustomerId,
	annualCustomerId,
	monthlyV2CustomerId,
	monthlyV3CustomerId,
	annualV3CustomerId,
];

const waitForPropagation = (ms = 1000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

type CheckResult = {
	allowed: boolean;
	balance?: {
		granted?: number;
		granted_balance?: number;
	};
};

type CustomerWithSubscriptions = {
	subscriptions?: unknown[];
};

const baseItemsV1 = [
	{
		feature_id: TestFeature.Words,
		included: 10,
		reset: { interval: ResetInterval.Month },
	},
];

const baseItemsV2 = [
	{
		feature_id: TestFeature.Words,
		included: 20,
		reset: { interval: ResetInterval.Month },
	},
	{ feature_id: TestFeature.Dashboard },
];

const baseItemsV3 = [
	{
		feature_id: TestFeature.Words,
		included: 20,
		reset: { interval: ResetInterval.Month },
	},
	{ feature_id: TestFeature.Dashboard },
	{
		feature_id: TestFeature.Action1,
		included: 50,
		reset: { interval: ResetInterval.Month },
	},
];

const monthlyItemsV3_2 = [
	{
		feature_id: TestFeature.Words,
		included: 15,
		reset: { interval: ResetInterval.Month },
	},
	{ feature_id: TestFeature.Dashboard },
	{
		feature_id: TestFeature.Action1,
		included: 50,
		reset: { interval: ResetInterval.Month },
	},
];

const cleanup = async () => {
	for (const customerId of customerIds) {
		try {
			await autumnInt.customers.delete(customerId);
		} catch (_error) {}
	}

	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	try {
		await autumnRpc.plans.deleteVariant(planId, monthlyVariantId);
	} catch (_error) {}

	try {
		await autumnRpc.plans.deleteVariant(planId, annualVariantId);
	} catch (_error) {}
};

const setupCustomers = async () => {
	await initScenario({
		customerId: monthlyCustomerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.otherCustomers([
				{ id: annualCustomerId, paymentMethod: "success" },
				{ id: monthlyV2CustomerId, paymentMethod: "success" },
				{ id: monthlyV3CustomerId, paymentMethod: "success" },
				{ id: annualV3CustomerId, paymentMethod: "success" },
			]),
		],
		actions: [],
	});
};

const waitForCustomerSubscription = async ({
	customerId,
	attempts = 20,
	intervalMs = 500,
}: {
	customerId: string;
	attempts?: number;
	intervalMs?: number;
}) => {
	for (let attempt = 0; attempt < attempts; attempt++) {
		const customer =
			await autumnInt.customers.get<CustomerWithSubscriptions>(customerId);
		if ((customer.subscriptions?.length ?? 0) > 0) return;

		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	throw new Error(`Timed out waiting for subscription on ${customerId}`);
};

const attachVariant = async ({
	customerId,
	variantId,
}: {
	customerId: string;
	variantId: string;
}) => {
	await autumnInt.billing.attach({
		customer_id: customerId,
		plan_id: planId,
		variant_id: variantId,
	});
};

const getBase = async () => {
	const plan = await autumnRpc.plans.get<ApiPlanV1>(planId);
	ApiPlanV1Schema.parse(plan);
	return plan;
};

const getVariant = async ({ variantId }: { variantId: string }) => {
	const plan = await autumnRpc.plans.get<ApiPlanV1>(planId, {
		variantId,
	});
	ApiPlanV1Schema.parse(plan);
	return plan;
};

const getExactPlanVersion = async ({
	variantId,
	version,
	minorVersion,
}: {
	variantId?: string;
	version: number;
	minorVersion?: number;
}) => {
	const plan = await autumnRpc.rpc.call<ApiPlanV1>({
		method: "/plans.get",
		body: {
			plan_id: planId,
			...(variantId ? { variant_id: variantId } : {}),
			version,
			...(minorVersion === undefined ? {} : { minor_version: minorVersion }),
		},
	});

	ApiPlanV1Schema.parse(plan);
	return plan;
};

const getItem = ({
	plan,
	featureId,
}: {
	plan: ApiPlanV1;
	featureId: string;
}) => {
	return plan.items.find((item) => item.feature_id === featureId);
};

const expectVariantVersion = ({
	plan,
	version,
	minorVersion,
	semver,
}: {
	plan: ApiPlanV1;
	version: number;
	minorVersion: number;
	semver: string;
}) => {
	expect(plan.version).toBe(version);
	expect(plan.minor_version).toBe(minorVersion);
	expect(plan.semver).toBe(semver);
};

const expectPlanItems = ({
	plan,
	wordsIncluded,
	hasDashboard,
	action1Included,
}: {
	plan: ApiPlanV1;
	wordsIncluded?: number;
	hasDashboard?: boolean;
	action1Included?: number;
}) => {
	const wordsItem = getItem({ plan, featureId: TestFeature.Words });
	const dashboardItem = getItem({ plan, featureId: TestFeature.Dashboard });
	const action1Item = getItem({ plan, featureId: TestFeature.Action1 });

	if (wordsIncluded !== undefined) {
		expect(wordsItem).toBeDefined();
		expect(wordsItem?.included).toBe(wordsIncluded);
	}

	expect(Boolean(dashboardItem)).toBe(Boolean(hasDashboard));

	if (action1Included !== undefined) {
		expect(action1Item).toBeDefined();
		expect(action1Item?.included).toBe(action1Included);
	}
};

const expectCheckGrantedBalance = async ({
	customerId,
	featureId,
	grantedBalance,
}: {
	customerId: string;
	featureId: string;
	grantedBalance: number;
}) => {
	const res = await autumnInt.check<CheckResult>({
		customer_id: customerId,
		feature_id: featureId,
	});

	expect(res.allowed).toBe(true);
	expect(res.balance?.granted ?? res.balance?.granted_balance).toBe(
		grantedBalance,
	);
};

const expectCheckAllowed = async ({
	customerId,
	featureId,
}: {
	customerId: string;
	featureId: string;
}) => {
	const res = await autumnInt.check<CheckResult>({
		customer_id: customerId,
		feature_id: featureId,
	});

	expect(res.allowed).toBe(true);
};

test.concurrent(`${chalk.yellowBright("variant-propagation-advanced: mixed base and variant version propagation")}`, async () => {
	await cleanup();
	await setupCustomers();

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Prop Multi Base",
		group,
		auto_enable: false,
		items: baseItemsV1,
	});

	await autumnRpc.plans.createVariant<ApiPlanV1>({
		plan_id: planId,
		variant_id: monthlyVariantId,
		variant_name: "Multi Monthly",
	});

	await autumnRpc.plans.update<ApiPlanV1>(
		planId,
		{
			price: { amount: 1000, interval: BillingInterval.Month },
		},
		{ variantId: monthlyVariantId },
	);

	await autumnRpc.plans.createVariant<ApiPlanV1>({
		plan_id: planId,
		variant_id: annualVariantId,
		variant_name: "Multi Annual",
	});

	await autumnRpc.plans.update<ApiPlanV1>(
		planId,
		{
			price: { amount: 10000, interval: BillingInterval.Year },
		},
		{ variantId: annualVariantId },
	);

	await attachVariant({
		customerId: monthlyCustomerId,
		variantId: monthlyVariantId,
	});
	await waitForCustomerSubscription({ customerId: monthlyCustomerId });

	await attachVariant({
		customerId: annualCustomerId,
		variantId: annualVariantId,
	});
	await waitForCustomerSubscription({ customerId: annualCustomerId });

	await autumnRpc.plans.update<ApiPlanV1>(planId, {
		items: baseItemsV2,
	});

	await waitForPropagation();

	const baseAfterStep4 = await getBase();
	expect(baseAfterStep4.version).toBe(1);

	const monthlyAfterStep4 = await getVariant({ variantId: monthlyVariantId });
	expectVariantVersion({
		plan: monthlyAfterStep4,
		version: 2,
		minorVersion: 1,
		semver: "2.1",
	});
	expectPlanItems({
		plan: monthlyAfterStep4,
		wordsIncluded: 20,
		hasDashboard: true,
	});

	const annualAfterStep4 = await getVariant({ variantId: annualVariantId });
	expectVariantVersion({
		plan: annualAfterStep4,
		version: 2,
		minorVersion: 1,
		semver: "2.1",
	});
	expectPlanItems({
		plan: annualAfterStep4,
		wordsIncluded: 20,
		hasDashboard: true,
	});

	const monthlyV1 = await getExactPlanVersion({
		variantId: monthlyVariantId,
		version: 1,
		minorVersion: 1,
	});
	expect(monthlyV1.version).toBe(1);
	expect(monthlyV1.minor_version).toBe(1);

	const annualV1 = await getExactPlanVersion({
		variantId: annualVariantId,
		version: 1,
		minorVersion: 1,
	});
	expect(annualV1.version).toBe(1);
	expect(annualV1.minor_version).toBe(1);

	await attachVariant({
		customerId: monthlyV2CustomerId,
		variantId: monthlyVariantId,
	});
	await waitForCustomerSubscription({ customerId: monthlyV2CustomerId });

	await expectCheckGrantedBalance({
		customerId: monthlyV2CustomerId,
		featureId: TestFeature.Words,
		grantedBalance: 20,
	});
	await expectCheckAllowed({
		customerId: monthlyV2CustomerId,
		featureId: TestFeature.Dashboard,
	});

	await autumnRpc.plans.update<ApiPlanV1>(planId, {
		items: baseItemsV3,
	});

	await waitForPropagation();

	const baseAfterStep6 = await getBase();
	expect(baseAfterStep6.version).toBe(1);

	const monthlyAfterStep6 = await getVariant({ variantId: monthlyVariantId });
	expectVariantVersion({
		plan: monthlyAfterStep6,
		version: 3,
		minorVersion: 1,
		semver: "3.1",
	});
	expectPlanItems({
		plan: monthlyAfterStep6,
		wordsIncluded: 20,
		hasDashboard: true,
		action1Included: 50,
	});

	const annualAfterStep6 = await getVariant({ variantId: annualVariantId });
	expectVariantVersion({
		plan: annualAfterStep6,
		version: 2,
		minorVersion: 1,
		semver: "2.1",
	});
	expectPlanItems({
		plan: annualAfterStep6,
		wordsIncluded: 20,
		hasDashboard: true,
		action1Included: 50,
	});

	await attachVariant({
		customerId: monthlyV3CustomerId,
		variantId: monthlyVariantId,
	});
	await waitForCustomerSubscription({ customerId: monthlyV3CustomerId });

	await attachVariant({
		customerId: annualV3CustomerId,
		variantId: annualVariantId,
	});
	await waitForCustomerSubscription({ customerId: annualV3CustomerId });

	await expectCheckGrantedBalance({
		customerId: monthlyV3CustomerId,
		featureId: TestFeature.Words,
		grantedBalance: 20,
	});
	await expectCheckAllowed({
		customerId: monthlyV3CustomerId,
		featureId: TestFeature.Dashboard,
	});
	await expectCheckGrantedBalance({
		customerId: monthlyV3CustomerId,
		featureId: TestFeature.Action1,
		grantedBalance: 50,
	});

	await expectCheckGrantedBalance({
		customerId: annualV3CustomerId,
		featureId: TestFeature.Words,
		grantedBalance: 20,
	});
	await expectCheckAllowed({
		customerId: annualV3CustomerId,
		featureId: TestFeature.Dashboard,
	});
	await expectCheckGrantedBalance({
		customerId: annualV3CustomerId,
		featureId: TestFeature.Action1,
		grantedBalance: 50,
	});

	await autumnRpc.plans.update<ApiPlanV1>(
		planId,
		{ items: monthlyItemsV3_2 },
		{ variantId: monthlyVariantId },
	);

	await waitForPropagation();

	const monthlyAfterStep8 = await getVariant({ variantId: monthlyVariantId });
	expectVariantVersion({
		plan: monthlyAfterStep8,
		version: 3,
		minorVersion: 2,
		semver: "3.2",
	});
	expectPlanItems({
		plan: monthlyAfterStep8,
		wordsIncluded: 15,
		hasDashboard: true,
		action1Included: 50,
	});

	const baseAfterStep8 = await getBase();
	expect(baseAfterStep8.version).toBe(1);

	const annualAfterStep8 = await getVariant({ variantId: annualVariantId });
	expectVariantVersion({
		plan: annualAfterStep8,
		version: 2,
		minorVersion: 1,
		semver: "2.1",
	});
});
