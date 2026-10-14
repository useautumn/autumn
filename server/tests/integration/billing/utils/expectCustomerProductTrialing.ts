import { expect } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type ApiEntityV0,
	type ApiEntityV2,
	ApiVersion,
	formatMs,
	ms,
} from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli";
import {
	expectSubscriptionNotTrialing,
	expectSubscriptionPeriodAlignedWithTrialEnd,
	expectSubscriptionTrialing,
} from "./expect-customer-products/expectSubscriptionTrialing";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const TEN_MINUTES_MS = 10 * 60 * 1000;

type CustomerOrEntity =
	| ApiCustomerV3
	| ApiEntityV0
	| ApiCustomerV5
	| ApiEntityV2;
type V5CustomerOrEntity = ApiCustomerV5 | ApiEntityV2;

const isV5Customer = (
	customer: CustomerOrEntity,
): customer is V5CustomerOrEntity => "subscriptions" in customer;

export const expectProductTrialing = async ({
	customerId,
	customer: providedCustomer,
	productId,
	trialEndsAt: expectedTrialEndsAt,
	toleranceMs = TEN_MINUTES_MS + ms.hours(1),
}: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
	trialEndsAt?: number;
	toleranceMs?: number;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	if (isV5Customer(customer)) {
		return expectSubscriptionTrialing({
			customer,
			productId,
			trialEndsAt: expectedTrialEndsAt,
			toleranceMs,
		});
	}

	const products = customer.products ?? [];
	const product = products.find((p: { id?: string }) => p.id === productId);

	expect(
		product,
		`Product ${productId} not found for trialing check`,
	).toBeDefined();

	expect(
		product!.status,
		`Product ${productId} should have status "trialing" but got "${product!.status}"`,
	).toBe("trialing");

	const trialEndsAt = product!.current_period_end;
	expect(
		trialEndsAt,
		`Product ${productId} should have current_period_end defined when trialing`,
	).toBeDefined();

	if (expectedTrialEndsAt !== undefined) {
		expect(
			Math.abs(trialEndsAt! - expectedTrialEndsAt) < toleranceMs,
			`Product ${productId} current_period_end (${formatMs(trialEndsAt)}) should be within 10 min of ${formatMs(expectedTrialEndsAt)}`,
		).toBe(true);
	}

	return trialEndsAt;
};

export const expectProductNotTrialing = async ({
	customerId,
	customer: providedCustomer,
	productId,
	nowMs,
}: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
	nowMs?: number;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	if (isV5Customer(customer)) {
		return expectSubscriptionNotTrialing({ customer, productId });
	}

	const products = customer.products ?? [];
	const product = products.find((p: { id?: string }) => p.id === productId);

	expect(
		product,
		`Product ${productId} not found for not-trialing check`,
	).toBeDefined();

	if (nowMs !== undefined && product!.status === "trialing") {
		const currentPeriodStart = product!.current_period_start;
		const currentPeriodEnd = product!.current_period_end;
		if (!currentPeriodStart || !currentPeriodEnd) {
			throw new Error(
				`Product ${productId} has no current_period_start or current_period_end`,
			);
		}
		expect(
			nowMs >= currentPeriodStart || nowMs >= currentPeriodEnd,
			`Product ${productId} is still trialing (status: "trialing", current_period_end: ${formatMs(currentPeriodEnd)}, nowMs: ${formatMs(nowMs)}). Trial has not ended yet.`,
		).toBe(true);
		return;
	}

	expect(
		product!.status,
		`Product ${productId} should not have status "trialing" but got "${product!.status}"`,
	).not.toBe("trialing");
};

export const expectFeatureResetAlignedWithTrialEnd = async ({
	customerId,
	customer: providedCustomer,
	featureId,
	trialEndsAt,
}: {
	customerId?: string;
	customer?: ApiCustomerV3 | ApiEntityV0;
	featureId: string;
	trialEndsAt: number;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	expect(
		customer.features,
		"Customer features not found for reset alignment check",
	).toBeDefined();

	const feature = customer.features![featureId];
	expect(
		feature,
		`Feature ${featureId} not found for reset alignment check`,
	).toBeDefined();

	expect(
		feature!.next_reset_at,
		`Feature ${featureId} should have next_reset_at defined`,
	).toBeDefined();

	expect(
		Math.abs(feature!.next_reset_at! - trialEndsAt) < ONE_HOUR_MS,
		`Feature ${featureId} next_reset_at (${feature!.next_reset_at}) should align with trial_ends_at (${trialEndsAt})`,
	).toBe(true);
};

export const expectPeriodEndsAlignedWithTrialEnd = async ({
	customerId,
	customer: providedCustomer,
	productId,
	trialEndsAt,
}: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
	trialEndsAt: number;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	if (isV5Customer(customer)) {
		return expectSubscriptionPeriodAlignedWithTrialEnd({
			customer,
			productId,
			trialEndsAt,
		});
	}

	const products = customer.products ?? [];
	const product = products.find((p: { id?: string }) => p.id === productId);

	expect(
		product,
		`Product ${productId} not found for period_ends alignment check`,
	).toBeDefined();

	expect(
		product!.current_period_end,
		`Product ${productId} should have current_period_end defined`,
	).toBeDefined();

	expect(
		Math.abs(product!.current_period_end! - trialEndsAt) < ONE_HOUR_MS,
		`Product ${productId} current_period_end (${product!.current_period_end}) should align with trial_ends_at (${trialEndsAt})`,
	).toBe(true);
};

export const calculateTrialEndMs = ({
	trialDays,
}: {
	trialDays: number;
}): number => {
	return Date.now() + trialDays * ONE_DAY_MS;
};

export const getTrialEndsAt = async ({
	customerId,
	customer: providedCustomer,
	productId,
}: {
	customerId?: string;
	customer?: CustomerOrEntity;
	productId: string;
}): Promise<number | null> => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	if (isV5Customer(customer)) {
		const sub = customer.subscriptions.find((s) => s.plan_id === productId);
		return sub?.trial_ends_at ?? null;
	}

	const products = customer.products ?? [];
	const product = products.find((p: { id?: string }) => p.id === productId);

	if (!product || product.status !== "trialing") {
		return null;
	}

	return product.current_period_end ?? null;
};
