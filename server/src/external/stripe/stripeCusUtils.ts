import {
	type AppEnv,
	type Customer,
	ErrCode,
	type Organization,
	ProcessorType,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripeCustomer } from "@/external/stripe/customers";
import { CusService } from "@/internal/customers/CusService.js";
import RecaseError from "@/utils/errorUtils.js";
import type { TestContext } from "../../../tests/utils/testInitUtils/createTestContext";

export const getStripeCus = async ({
	stripeCli,
	stripeId,
}: {
	stripeCli: Stripe;
	stripeId: string;
}) => {
	try {
		const stripeCus = await stripeCli.customers.retrieve(stripeId);
		return stripeCus as Stripe.Customer;
	} catch (_error) {
		return undefined;
	}
};

export const deleteStripeCustomer = async ({
	org,
	env,
	stripeId,
}: {
	org: Organization;
	env: AppEnv;
	stripeId: string;
}) => {
	const stripeCli = createStripeCli({ org, env });

	const stripeCustomer = await stripeCli.customers.del(stripeId);

	return stripeCustomer;
};

export const listCusPaymentMethods = async ({
	stripeCli,
	stripeId,
}: {
	stripeCli: Stripe;
	stripeId: string;
}) => {
	const res = await stripeCli.paymentMethods.list({
		customer: stripeId,
	});

	const paymentMethods = res.data;
	paymentMethods.sort((a, b) => b.created - a.created);

	return paymentMethods;
};

export const getCusPaymentMethod = async ({
	stripeCli,
	stripeId,
	errorIfNone = false,
	typeFilter,
}: {
	stripeCli: Stripe;
	stripeId?: string;
	errorIfNone?: boolean;
	typeFilter?: string;
}) => {
	if (!stripeId) {
		return null;
	}

	const stripeCustomer = (await stripeCli.customers.retrieve(
		stripeId,
	)) as Stripe.Customer;

	const paymentMethodId =
		stripeCustomer.invoice_settings?.default_payment_method;

	if (!paymentMethodId) {
		const res = await stripeCli.paymentMethods.list({
			customer: stripeId,
		});

		let paymentMethods = res.data;
		paymentMethods.sort((a, b) => b.created - a.created);
		if (typeFilter) {
			paymentMethods = paymentMethods.filter((pm) => pm.type === typeFilter);
		}

		if (paymentMethods.length === 0) {
			if (errorIfNone) {
				throw new RecaseError({
					code: ErrCode.StripeGetPaymentMethodFailed,
					message: `No payment method found for customer ${stripeId}`,
					statusCode: 500,
				});
			}
			return null;
		}

		return paymentMethods[0];
	} else {
		const paymentMethod = await stripeCli.paymentMethods.retrieve(
			paymentMethodId as string,
		);
		return paymentMethod;
	}
};

// 2. Create a payment method and attach to customer
export const attachPmToCus = async ({
	db,
	customer,
	org,
	env,
	willFail = false,
	testClockId,
}: {
	db: DrizzleCli;
	customer: Customer;
	org: Organization;
	env: AppEnv;
	willFail?: boolean;
	testClockId?: string;
}) => {
	// 1. Create stripe customer if not exists

	let stripeCusId = customer.processor?.id;
	if (!stripeCusId) {
		const stripeCustomer = await createStripeCustomer({
			ctx: { org, env, db } as any,
			customer,
			options: { testClockId },
		});

		await CusService.update({
			db,
			idOrInternalId: customer.internal_id,
			orgId: org.id,
			env,
			update: {
				processor: {
					id: stripeCustomer.id,
					type: ProcessorType.Stripe,
				},
			},
		});

		stripeCusId = stripeCustomer.id;
		customer.processor = {
			id: stripeCustomer.id,
			type: "stripe",
		};
	}

	const stripeCli = createStripeCli({ org, env });

	try {
		const token = willFail ? "tok_chargeCustomerFail" : "tok_visa";
		const pm = await stripeCli.paymentMethods.create({
			type: "card",
			card: {
				token,
			},
		});
		await stripeCli.paymentMethods.attach(pm.id, {
			customer: stripeCusId,
		});

		await stripeCli.customers.update(stripeCusId, {
			invoice_settings: {
				default_payment_method: pm.id,
			},
		});
		// console.log("   - Payment method attached");
	} catch (error) {
		console.log("   - Error attaching payment method", error);
	}
};

export const attachFailedPaymentMethod = async ({
	stripeCli,
	customer,
}: {
	stripeCli: Stripe;
	customer: Customer;
}) => {
	// Delete existing payment method
	const paymentMethods = await stripeCli.paymentMethods.list({
		customer: customer.processor?.id,
	});
	for (const pm of paymentMethods.data) {
		await stripeCli.paymentMethods.detach(pm.id);
	}

	const pm = await stripeCli.paymentMethods.create({
		type: "card",
		card: {
			token: "tok_chargeCustomerFail",
		},
	});
	await stripeCli.paymentMethods.attach(pm.id, {
		customer: customer.processor?.id,
	});
};

export const attachAuthenticatePaymentMethod = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const { org, env, db } = ctx;
	const stripeCli = createStripeCli({ org, env });
	const autumnCustomer = await CusService.get({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env: env,
	});

	const stripeCustomer = await stripeCli.customers.retrieve(
		autumnCustomer!.processor?.id,
	);
	// Delete existing payment method
	const paymentMethods = await stripeCli.paymentMethods.list({
		customer: stripeCustomer.id,
	});
	for (const pm of paymentMethods.data) {
		await stripeCli.paymentMethods.detach(pm.id);
	}

	await stripeCli.paymentMethods.attach("pm_card_authenticationRequired", {
		customer: stripeCustomer.id,
	});
};

export const deleteAllStripeCustomers = async ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	const stripeCli = createStripeCli({ org, env });

	const stripeCustomers = await stripeCli.customers.list({
		limit: 100,
	});

	if (stripeCustomers.data.length === 0) {
		return;
	}

	const firstCustomer = stripeCustomers.data[0];
	if (firstCustomer.livemode) {
		throw new RecaseError({
			message: "Cannot delete livemode customers",
			code: ErrCode.StripeDeleteCustomerFailed,
			statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
		});
	}

	const batchSize = 10;
	for (let i = 0; i < stripeCustomers.data.length; i += batchSize) {
		const batch = stripeCustomers.data.slice(i, i + batchSize);
		await Promise.all(batch.map((c) => stripeCli.customers.del(c.id)));
		console.log(
			`Deleted ${i + batch.length}/${stripeCustomers.data.length} customers`,
		);
	}
};
