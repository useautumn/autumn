import type { Customer, CustomerData, FullSubject } from "@autumn/shared";
import { z } from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { updateCachedCustomerData } from "@/internal/customers/cache/fullSubject/index.js";
import { updateCachedCustomerData as updateCachedCustomerDataV1 } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/updateCachedCustomerData.js";

export const updateCustomerData = async ({
	ctx,
	fullSubject,
	customerData,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	customerData?: CustomerData;
}) => {
	const { logger } = ctx;
	const idOrInternalId =
		fullSubject.customer.id || fullSubject.customer.internal_id;

	const updates: Partial<Customer> = {};
	if (!fullSubject.customer.name && customerData?.name) {
		updates.name = customerData.name;
	}
	if (!fullSubject.customer.email && customerData?.email) {
		if (z.string().email().safeParse(customerData.email).error) {
			logger.info(`Invalid email ${customerData.email}, skipping update`);
		} else {
			updates.email = customerData.email;
		}
	}
	if (
		customerData?.send_email_receipts !== undefined &&
		fullSubject.customer.send_email_receipts !==
			customerData.send_email_receipts
	) {
		updates.send_email_receipts = customerData.send_email_receipts;
	}

	if (Object.keys(updates).length === 0) return false;

	logger.info(`Updating customer details:`, {
		data: updates,
	});

	await CusService.update({
		ctx,
		idOrInternalId,
		update: updates,
	});

	Object.assign(fullSubject.customer, updates);

	await Promise.all([
		updateCachedCustomerData({
			ctx,
			customerId: idOrInternalId,
			updates,
		}),
		updateCachedCustomerDataV1({
			ctx,
			customerId: idOrInternalId,
			updates,
		}),
	]);

	return true;
};
