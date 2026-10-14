import { expect } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";

export const CUSTOMER_UPDATED_WAIT_MS = 8000;

export const getStripeCustomerId = (customer: {
	processor?: { id?: string } | null;
} | null): string => {
	const stripeId = customer?.processor?.id;
	if (!stripeId) {
		throw new Error("Customer has no linked Stripe id (processor.id)");
	}
	return stripeId;
};

export const updateStripeCustomerAndWait = async ({
	ctx,
	stripeCustomerId,
	update,
	waitMs = CUSTOMER_UPDATED_WAIT_MS,
}: {
	ctx: TestContext;
	stripeCustomerId: string;
	update: Stripe.CustomerUpdateParams;
	waitMs?: number;
}): Promise<void> => {
	await ctx.stripeCli.customers.update(stripeCustomerId, update);
	await timeout(waitMs);
};

export const expectCustomerDetails = async ({
	autumn,
	customerId,
	name,
	email,
}: {
	autumn: AutumnInt;
	customerId: string;
	name?: string | null;
	email?: string | null;
}): Promise<ApiCustomerV3> => {
	const customer = await autumn.customers.get<ApiCustomerV3>(customerId);
	if (name !== undefined) expect(customer.name).toBe(name);
	if (email !== undefined) expect(customer.email).toBe(email);
	return customer;
};
