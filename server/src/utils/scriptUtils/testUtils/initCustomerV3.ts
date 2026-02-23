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
	existingTestClockId,
	withDefault = false,
	defaultGroup = customerId,
	skipWebhooks,
	sendEmailReceipts,
	nameOverride,
	emailOverride,
}: {
	ctx: TestContext;
	customerId: string;
	attachPm?: "success" | "fail" | "authenticate" | "alipay";
	customerData?: CustomerData;
	withTestClock?: boolean;
	existingTestClockId?: string;
	withDefault?: boolean;
	defaultGroup?: string;
	skipWebhooks?: boolean;
	sendEmailReceipts?: boolean;
	nameOverride?: string | null;
	emailOverride?: string | null;
}) => {
	// Use override if provided (including null), otherwise default to customerId-based values
	const name =
		nameOverride !== undefined ? (nameOverride ?? undefined) : customerId;
	const email =
		emailOverride !== undefined
			? (emailOverride ?? undefined)
			: `${customerId}@example.com`;
	const { stripeCli } = ctx;
	const autumn = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	let testClockId: string | undefined = existingTestClockId;

	if (withTestClock && !existingTestClockId) {
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
		send_email_receipts: sendEmailReceipts,
		internalOptions: {
			disable_defaults: !withDefault,
			// Only pass default_group when defaults are enabled
			...(withDefault && { default_group: defaultGroup }),
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

	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	return {
		testClockId: testClockId || "",
		customer,
	};
};
