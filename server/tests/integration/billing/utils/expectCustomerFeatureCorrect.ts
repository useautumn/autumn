import { expect } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiEntityV0,
	ApiVersion,
} from "@autumn/shared";
import type { Customer } from "autumn-js";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

export const expectCustomerFeatureExists = async ({
	customerId,
	customer: providedCustomer,
	featureId,
}: {
	customerId?: string;
	customer?: Customer | ApiEntityV0;
	featureId: string;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	const feature = customer.features?.[featureId];

	expect(feature).toBeDefined();
};

const TEN_MINUTES_MS = 10 * 60 * 1000;

export const expectCustomerFeatureCorrect = ({
	customerId,
	customer: providedCustomer,
	featureId,
	includedUsage,
	balance,
	usage,
	resetsAt,
}: {
	customerId?: string;
	customer?: ApiCustomerV3 | ApiEntityV0;
	featureId: string;
	includedUsage?: number;
	balance?: number;
	usage?: number;
	resetsAt?: number;
}) => {
	if (!providedCustomer && !customerId) {
		throw new Error("Either customer or customerId must be provided");
	}

	const feature = providedCustomer?.features?.[featureId];
	expect(feature, `Feature ${featureId} not found`).toBeDefined();

	if (includedUsage !== undefined) {
		expect(feature?.included_usage).toBe(includedUsage);
	}

	if (balance !== undefined) {
		expect(feature?.balance).toBe(balance);
	}

	if (usage !== undefined) {
		expect(feature?.usage).toBe(usage);
	}

	if (resetsAt !== undefined) {
		const actualResetsAt = feature?.next_reset_at ?? 0;
		expect(actualResetsAt).toBeDefined();
		expect(Math.abs(actualResetsAt - resetsAt)).toBeLessThanOrEqual(
			TEN_MINUTES_MS,
		);
	}
};
