import type { Customer, CustomerData, CustomerUpdate } from "@autumn/shared";
import { z } from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { updateCachedCustomerData } from "@/internal/customers/cache/fullSubject/index.js";

/** The columns `customer_data` fills: an empty name or email, and a changed `send_email_receipts`. */
export const customerDataToCustomerUpdates = ({
	ctx,
	customer,
	customerData,
}: {
	ctx: AutumnContext;
	customer: Customer;
	customerData?: CustomerData;
}): CustomerUpdate["updates"] => {
	const { logger } = ctx;
	const updates: CustomerUpdate["updates"] = {};
	if (!customer.name && customerData?.name) {
		updates.name = customerData.name;
	}
	if (!customer.email && customerData?.email) {
		if (
			z.email({ pattern: z.regexes.unicodeEmail }).safeParse(customerData.email)
				.error
		) {
			logger.info(`Invalid email ${customerData.email}, skipping update`);
		} else {
			updates.email = customerData.email;
		}
	}
	if (
		customerData?.send_email_receipts !== undefined &&
		customer.send_email_receipts !== customerData.send_email_receipts
	) {
		updates.send_email_receipts = customerData.send_email_receipts;
	}
	return updates;
};

export const updateCustomerData = async ({
	ctx,
	customer,
	customerData,
}: {
	ctx: AutumnContext;
	customer: Customer;
	customerData?: CustomerData;
}) => {
	const { logger } = ctx;
	const idOrInternalId = customer.id || customer.internal_id;
	const updates = customerDataToCustomerUpdates({
		ctx,
		customer,
		customerData,
	});
	if (Object.keys(updates).length === 0) return false;

	logger.info(`Updating customer details:`, {
		data: updates,
	});

	await CusService.update({
		ctx,
		idOrInternalId,
		update: updates,
	});

	Object.assign(customer, updates);

	await updateCachedCustomerData({
		ctx,
		customerId: idOrInternalId,
		updates,
	});

	return true;
};
