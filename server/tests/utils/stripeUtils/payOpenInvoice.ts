import { openStripeInvoiceId } from "@tests/utils/stripeUtils/openStripeInvoiceId";
import { stripeCustomerId } from "@tests/utils/stripeUtils/stripeCustomerId";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";

const TEST_PAYMENT_METHOD = "pm_card_visa";

export const payOpenInvoice = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}): Promise<string> => {
	const stripeCusId = await stripeCustomerId({ ctx, customerId });
	const invoiceId = await openStripeInvoiceId({ ctx, customerId });

	const paymentMethod = await ctx.stripeCli.paymentMethods
		.attach(TEST_PAYMENT_METHOD, { customer: stripeCusId })
		.catch(() => null);

	await ctx.stripeCli.invoices.pay(
		invoiceId,
		paymentMethod ? { payment_method: paymentMethod.id } : {},
	);

	return invoiceId;
};
