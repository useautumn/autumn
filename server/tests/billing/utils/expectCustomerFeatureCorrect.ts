import { expect } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import type { Customer } from "autumn-js";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

export const expectCustomerFeatureExists = async ({
	customerId,
	customer: providedCustomer,
	featureId,
}: {
	customerId?: string;
	customer?: Customer;
	featureId: string;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	const feature = customer.features[featureId];

	expect(feature).toBeDefined();
};

const ONE_HOUR_MS = 60 * 60 * 1000;

export const expectCustomerFeatureCorrect = async ({
	customerId,
	customer: providedCustomer,
	featureId,
	includedUsage,
	balance,
	usage,
	resetsAt,
}: {
	customerId?: string;
	customer?: Customer;
	featureId: string;
	includedUsage?: number;
	balance?: number;
	usage?: number;
	resetsAt?: number;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);
	const feature = customer.features[featureId];

	expect(feature).toMatchObject({
		included_usage: includedUsage,
		balance,
		usage,
	});

	if (resetsAt !== undefined) {
		const actualResetsAt = feature.next_reset_at ?? 0;
		expect(actualResetsAt).toBeDefined();
		expect(Math.abs(actualResetsAt - resetsAt)).toBeLessThanOrEqual(
			ONE_HOUR_MS,
		);
	}
};
