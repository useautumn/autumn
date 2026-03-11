import { expect } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	CheckResponseV3,
	EntityBillingControls,
} from "@autumn/shared";
import { timeout } from "@tests/utils/genUtils.js";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario.js";

export type AutumnV2_1Client = Awaited<
	ReturnType<typeof initScenario>
>["autumnV2_1"];

export const setEntitySpendLimit = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	overageLimit,
	enabled = true,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	entityId: string;
	featureId: string;
	overageLimit: number;
	enabled?: boolean;
}) => {
	const billingControls: EntityBillingControls = {
		spend_limits: [
			{
				feature_id: featureId,
				enabled,
				overage_limit: overageLimit,
			},
		],
	};

	await autumn.entities.update(customerId, entityId, {
		billing_controls: billingControls,
	});
};

export const getActionUnitsForCreditAmount = ({
	creditAmount,
	creditCostPerActionUnit,
}: {
	creditAmount: number;
	creditCostPerActionUnit: number;
}) => creditAmount / creditCostPerActionUnit;

export const expectEntityFeatureBalance = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	granted,
	remaining,
	usage,
	maxPurchase,
	breakdownLength,
	skipCache = false,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	entityId: string;
	featureId: string;
	granted: number;
	remaining: number;
	usage: number;
	maxPurchase?: number | null;
	breakdownLength?: number;
	skipCache?: boolean;
}) => {
	await timeout(3000);
	const entity = await autumn.entities.get<ApiEntityV2>(customerId, entityId, {
		skip_cache: skipCache ? "true" : undefined,
	});

	expect(entity.balances[featureId]).toMatchObject({
		feature_id: featureId,
		granted,
		remaining,
		usage,
		...(maxPurchase === undefined
			? {}
			: {
					max_purchase: maxPurchase,
				}),
	});

	if (breakdownLength !== undefined) {
		expect(entity.balances[featureId]?.breakdown).toHaveLength(breakdownLength);
	}
};

export const expectCustomerFeatureBalance = async ({
	autumn,
	customerId,
	featureId,
	granted,
	remaining,
	usage,
	maxPurchase,
	breakdownLength,
	skipCache = false,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	featureId: string;
	granted: number;
	remaining: number;
	usage: number;
	maxPurchase?: number | null;
	breakdownLength?: number;
	skipCache?: boolean;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: skipCache ? "true" : undefined,
	});

	expect(customer.balances[featureId]).toMatchObject({
		feature_id: featureId,
		granted,
		remaining,
		usage,
		...(maxPurchase === undefined
			? {}
			: {
					max_purchase: maxPurchase,
				}),
	});

	if (breakdownLength !== undefined) {
		expect(customer.balances[featureId]?.breakdown).toHaveLength(
			breakdownLength,
		);
	}
};

export const expectSendEventBlocked = async ({
	autumn,
	customerId,
	entityId,
	requestFeatureId,
	requiredBalance,
	entity,
	customer,
	expectedFeatureId = requestFeatureId,
	expectedResponseRequiredBalance = requiredBalance,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	entityId: string;
	requestFeatureId: string;
	requiredBalance: number;
	entity: {
		granted: number;
		remaining: number;
		usage: number;
		maxPurchase?: number | null;
		breakdownLength?: number;
	};
	customer?: {
		granted: number;
		remaining: number;
		usage: number;
		maxPurchase?: number | null;
		breakdownLength?: number;
	};
	expectedFeatureId?: string;
	expectedResponseRequiredBalance?: number;
}) => {
	const customerExpectation = customer ?? entity;

	const response = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: requestFeatureId,
		required_balance: requiredBalance,
		send_event: true,
	});

	expect(response).toMatchObject({
		allowed: false,
		customer_id: customerId,
		entity_id: entityId,
		required_balance: expectedResponseRequiredBalance,
		balance: {
			feature_id: expectedFeatureId,
			granted: entity.granted,
			remaining: entity.remaining,
			usage: entity.usage,
			...(entity.maxPurchase === undefined
				? {}
				: {
						max_purchase: entity.maxPurchase,
					}),
		},
	});

	if (entity.breakdownLength !== undefined) {
		expect(response.balance?.breakdown).toHaveLength(entity.breakdownLength);
	}

	await timeout(4000);

	await expectEntityFeatureCachedAndDb({
		autumn,
		customerId,
		entityId,
		featureId: expectedFeatureId,
		granted: entity.granted,
		remaining: entity.remaining,
		usage: entity.usage,
		maxPurchase: entity.maxPurchase,
		breakdownLength: entity.breakdownLength,
	});

	await expectCustomerFeatureCachedAndDb({
		autumn,
		customerId,
		featureId: expectedFeatureId,
		granted: customerExpectation.granted,
		remaining: customerExpectation.remaining,
		usage: customerExpectation.usage,
		maxPurchase: customerExpectation.maxPurchase,
		breakdownLength: customerExpectation.breakdownLength,
	});
};

export const expectEntityFeatureCachedAndDb = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	granted,
	remaining,
	usage,
	maxPurchase,
	breakdownLength,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	entityId: string;
	featureId: string;
	granted: number;
	remaining: number;
	usage: number;
	maxPurchase?: number | null;
	breakdownLength?: number;
}) => {
	await expectEntityFeatureBalance({
		autumn,
		customerId,
		entityId,
		featureId,
		granted,
		remaining,
		usage,
		maxPurchase,
		breakdownLength,
	});

	await expectEntityFeatureBalance({
		autumn,
		customerId,
		entityId,
		featureId,
		granted,
		remaining,
		usage,
		maxPurchase,
		breakdownLength,
		skipCache: true,
	});
};

export const expectCustomerFeatureCachedAndDb = async ({
	autumn,
	customerId,
	featureId,
	granted,
	remaining,
	usage,
	maxPurchase,
	breakdownLength,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	featureId: string;
	granted: number;
	remaining: number;
	usage: number;
	maxPurchase?: number | null;
	breakdownLength?: number;
}) => {
	await expectCustomerFeatureBalance({
		autumn,
		customerId,
		featureId,
		granted,
		remaining,
		usage,
		maxPurchase,
		breakdownLength,
	});

	await expectCustomerFeatureBalance({
		autumn,
		customerId,
		featureId,
		granted,
		remaining,
		usage,
		maxPurchase,
		breakdownLength,
		skipCache: true,
	});
};
