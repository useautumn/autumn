/**
 * Contract: prepaid consumable features may bill on one interval and reset on
 * another. The price interval must drive Stripe billing, while the entitlement
 * interval must drive lazy/cron resets. invoice.created must not reset these
 * balances because the Stripe invoice cadence is intentionally different.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiPlanV1,
	ApiVersion,
	type AttachParamsV1Input,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	type Customer,
	EntInterval,
	ResetInterval,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { resetAndGetCusEnt } from "@tests/balances/track/rollovers/rolloverTestUtils.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { CusService } from "@/internal/customers/CusService.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });

const getSuffix = () => Math.random().toString(36).slice(2, 9);

const getPlanGroup = ({ planId }: { planId: string }) =>
	`split-interval-${planId}`;

const createSplitIntervalPlan = async ({
	planId,
	priceInterval = BillingInterval.Year,
}: {
	planId: string;
	priceInterval?: BillingInterval;
}) => {
	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	const plan = await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Split Interval Prepaid Credits",
		group: getPlanGroup({ planId }),
		auto_enable: false,
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 0,
				reset: {
					interval: ResetInterval.Month,
				},
				price: {
					amount: 10,
					interval: priceInterval,
					billing_units: 100,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
	});

	const item = plan.items.find((candidate) => {
		return candidate.feature_id === TestFeature.Messages;
	});
	expect(item?.reset?.interval).toBe(ResetInterval.Month);
	expect(item?.price?.interval).toBe(priceInterval);
	expect(item?.price?.billing_method).toBe(BillingMethod.Prepaid);

	return plan;
};

const getSplitCustomerProductState = async ({
	ctx,
	customerId,
	planId,
	skipReset = true,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	planId: string;
	skipReset?: boolean;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		skipReset,
	});

	const customerProduct = fullCustomer.customer_products.find(
		(candidate) => candidate.product.id === planId,
	);
	if (!customerProduct) {
		throw new Error(`Customer product not found for plan ${planId}`);
	}

	const customerEntitlement = customerProduct.customer_entitlements.find(
		(candidate) => candidate.entitlement.feature_id === TestFeature.Messages,
	);
	if (!customerEntitlement) {
		throw new Error(`Customer entitlement not found for plan ${planId}`);
	}

	const customerPrice = customerProduct.customer_prices.find((candidate) => {
		return candidate.price.config.feature_id === TestFeature.Messages;
	});
	if (!customerPrice) {
		throw new Error(`Customer price not found for plan ${planId}`);
	}

	return {
		customerProduct,
		customerEntitlement,
		customerPrice,
		priceConfig: customerPrice.price.config,
	};
};

const forceEntitlementDueAndRunCronReset = async ({
	ctx,
	customer,
	customerId,
	planId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customer: Customer | null | undefined;
	customerId: string;
	planId: string;
}) => {
	if (!customer) {
		throw new Error("Expected scenario customer for split interval reset test");
	}

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	await resetAndGetCusEnt({
		ctx,
		customer,
		productGroup: getPlanGroup({ planId }),
		featureId: TestFeature.Messages,
	});

	return getSplitCustomerProductState({
		ctx,
		customerId,
		planId,
		skipReset: true,
	});
};

test.concurrent(`${chalk.yellowBright("split-interval prepaid: attach, update quantity, cron monthly reset")}`, async () => {
	const suffix = getSuffix();
	const customerId = `split-int-update-${suffix}`;
	const planId = `split_int_update_${suffix}`;

	await createSplitIntervalPlan({ planId });

	const { autumnV2_2, ctx, customer: scenarioCustomer } = await initScenario({
		customerId,
		setup: [s.customer({ paymentMethod: "success" })],
		actions: [],
	});

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: 1000 },
		],
		redirect_mode: "if_required",
	});

	let state = await getSplitCustomerProductState({
		ctx,
		customerId,
		planId,
	});
	expect(state.customerEntitlement.entitlement.interval).toBe(EntInterval.Month);
	expect(state.priceConfig.interval).toBe(BillingInterval.Year);
	expect(state.customerEntitlement.separate_interval).toBe(true);
	expect(state.customerProduct.billing_cycle_anchor).toBeDefined();
	expect(state.customerEntitlement.reset_cycle_anchor).toBeDefined();
	expect(state.customerEntitlement.reset_cycle_anchor).toBe(
		state.customerProduct.billing_cycle_anchor,
	);

	let customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 1000,
		usage: 0,
		planId,
	});

	await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 300,
	});

	customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 700,
		usage: 300,
		planId,
	});

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: planId,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: 1500 },
		],
		redirect_mode: "if_required",
	});

	customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 1500,
		usage: 0,
		planId,
	});

	await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 300,
	});

	customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 1200,
		usage: 300,
		planId,
	});

	state = await getSplitCustomerProductState({
		ctx,
		customerId,
		planId,
	});
	expect(state.priceConfig.interval).toBe(BillingInterval.Year);
	expect(state.customerEntitlement.entitlement.interval).toBe(EntInterval.Month);
	expect(state.customerProduct.billing_cycle_anchor).toBeDefined();
	expect(state.customerEntitlement.reset_cycle_anchor).toBe(
		state.customerProduct.billing_cycle_anchor,
	);

	const stateAfterCronReset = await forceEntitlementDueAndRunCronReset({
		ctx,
		customer: scenarioCustomer,
		customerId,
		planId,
	});

	expect(stateAfterCronReset.customerEntitlement.balance).toBe(1500);
	expect(stateAfterCronReset.customerEntitlement.next_reset_at).toBeGreaterThan(
		Date.now(),
	);
});

test.concurrent(`${chalk.yellowBright("split-interval prepaid: lazy customer get resets monthly entitlement")}`, async () => {
	const customerId = "split-int-lazy";
	const planId = "split_int_lazy";

	await createSplitIntervalPlan({ planId });

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ paymentMethod: "success" })],
		actions: [],
	});

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: 1000 },
		],
		redirect_mode: "if_required",
	});

	await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 300,
	});

	let customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 700,
		usage: 300,
		planId,
	});

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 1000,
		usage: 0,
		planId,
	});

	const stateAfterLazyReset = await getSplitCustomerProductState({
		ctx,
		customerId,
		planId,
	});
	expect(stateAfterLazyReset.customerEntitlement.balance).toBe(1000);
	expect(stateAfterLazyReset.customerEntitlement.next_reset_at).toBeGreaterThan(
		Date.now(),
	);
	expect(stateAfterLazyReset.customerEntitlement.separate_interval).toBe(true);
	expect(stateAfterLazyReset.customerProduct.billing_cycle_anchor).toBeDefined();
	expect(stateAfterLazyReset.customerEntitlement.reset_cycle_anchor).toBe(
		stateAfterLazyReset.customerProduct.billing_cycle_anchor,
	);
});

test.concurrent(`${chalk.yellowBright("split-interval prepaid: quarterly invoice.created does not reset monthly entitlement")}`, async () => {
	const suffix = getSuffix();
	const customerId = `split-int-invoice-${suffix}`;
	const planId = `split_int_invoice_${suffix}`;

	await createSplitIntervalPlan({
		planId,
		priceInterval: BillingInterval.Quarter,
	});

	const {
		autumnV2_2,
		ctx,
		testClockId,
		advancedTo,
		customer: scenarioCustomer,
	} = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true, paymentMethod: "success" })],
		actions: [],
	});
	if (!testClockId) {
		throw new Error("Expected test clock ID for split interval invoice test");
	}

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: 1000 },
		],
		redirect_mode: "if_required",
	});

	await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 300,
	});

	const customerBeforeQuarterly =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const firstNextResetAt =
		customerBeforeQuarterly.balances[TestFeature.Messages].next_reset_at;
	expect(firstNextResetAt).toBeDefined();

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId,
		advanceTo: addHours(addMonths(advancedTo, 3), 2).getTime(),
		waitForSeconds: 30,
	});

	const rawStateAfterQuarterlyInvoice = await getSplitCustomerProductState({
		ctx,
		customerId,
		planId,
		skipReset: true,
	});

	expect(rawStateAfterQuarterlyInvoice.customerEntitlement.balance).toBe(700);
	expect(rawStateAfterQuarterlyInvoice.customerEntitlement.next_reset_at).toBe(
		firstNextResetAt,
	);
	expect(rawStateAfterQuarterlyInvoice.priceConfig.interval).toBe(
		BillingInterval.Quarter,
	);
	expect(rawStateAfterQuarterlyInvoice.customerProduct.billing_cycle_anchor).toBeDefined();
	expect(rawStateAfterQuarterlyInvoice.customerEntitlement.reset_cycle_anchor).toBe(
		rawStateAfterQuarterlyInvoice.customerProduct.billing_cycle_anchor,
	);

	const stateAfterCronReset = await forceEntitlementDueAndRunCronReset({
		ctx,
		customer: scenarioCustomer,
		customerId,
		planId,
	});
	expect(stateAfterCronReset.customerEntitlement.balance).toBe(1000);
	expect(stateAfterCronReset.customerEntitlement.next_reset_at).toBeGreaterThan(
		Date.now(),
	);
});
