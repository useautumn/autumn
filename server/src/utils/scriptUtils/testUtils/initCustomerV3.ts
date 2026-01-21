import { ApiVersion } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import type { CustomerData } from "autumn-js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { attachPaymentMethod } from "../initCustomer.js";

// V3 initializes the customer in Stripe, then creates the customer in Autumn
export const initCustomerV3 = async ({
	ctx,
	customerId,
	customerData,
	attachPm,
	withTestClock = true,
	withDefault = false,
	defaultGroup = customerId,
	skipWebhooks,
}: {
	ctx: TestContext;
	customerId: string;
	attachPm?: "success" | "fail" | "authenticate";
	customerData?: CustomerData;
	withTestClock?: boolean;
	withDefault?: boolean;
	defaultGroup?: string;
	skipWebhooks?: boolean;
}) => {
	const name = customerId;
	const email = `${customerId}@example.com`;
	const fingerprint_ = "";
	const { stripeCli } = ctx;
	const autumn = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	let testClockId: string | undefined;

	if (withTestClock) {
		const testClock = await stripeCli.testHelpers.testClocks.create({
			frozen_time: Math.floor(Date.now() / 1000),
		});
		testClockId = testClock.id;
	}

	// 1. Create stripe customer
	const stripeCus = await stripeCli.customers.create({
		email,
		name,
		test_clock: testClockId,
	});

	// 2. Create customer

	try {
		await autumn.customers.delete(customerId);
	} catch (_error) {}

	await autumn.customers.create({
		id: customerId,
		name,
		email,
		fingerprint: customerData?.fingerprint,
		stripe_id: stripeCus.id,
		internalOptions: {
			disable_defaults: !withDefault,
			default_group: defaultGroup,
		},
		skipWebhooks,
	});

	// 3. Attach payment method
	if (attachPm) {
		await attachPaymentMethod({
			stripeCli,
			stripeCusId: stripeCus.id,
			type: attachPm,
		});
	}

	const { db, org, env } = ctx;
	const customer = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env: env,
	});

	return {
		testClockId: testClockId || "",
		customer,
	};
};
