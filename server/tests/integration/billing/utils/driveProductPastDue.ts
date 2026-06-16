import { CusProductStatus, customerProducts } from "@autumn/shared";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { eq } from "drizzle-orm";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { timeout } from "@/utils/genUtils";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

// Fails the renewal (real open invoice), then forces only this product to past_due in Postgres
// (webhook sync is unreliable locally; mirrors balances/cron/past-due-reset.test.ts).
export const driveProductPastDue = async ({
	ctx,
	testClockId,
	customerId,
	productId,
}: {
	ctx: ScenarioCtx;
	testClockId: string;
	customerId: string;
	productId: string;
}): Promise<{
	subscriptionId: string;
	stripeCustomerId: string | undefined;
}> => {
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId,
	});

	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	await attachFailedPaymentMethod({
		stripeCli: ctx.stripeCli,
		customer: customer!,
	});

	const paymentMethods = await ctx.stripeCli.paymentMethods.list({
		customer: customer!.processor?.id,
	});
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		default_payment_method: paymentMethods.data[0].id,
	});

	await advanceToNextInvoice({ stripeCli: ctx.stripeCli, testClockId });
	await timeout(4000);

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === productId,
	);
	await ctx.db
		.update(customerProducts)
		.set({ status: CusProductStatus.PastDue })
		.where(eq(customerProducts.id, customerProduct!.id));
	await deleteCachedFullCustomer({ ctx, customerId });

	return { subscriptionId, stripeCustomerId: customer!.processor?.id };
};
