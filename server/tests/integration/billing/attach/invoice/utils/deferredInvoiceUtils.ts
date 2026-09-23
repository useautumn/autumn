import { expect } from "bun:test";
import { ALL_STATUSES, CusProductStatus, type Metadata } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

type TestCustomer = { internal_id: string };

const findCustomerProduct = async ({
	ctx,
	customer,
	productId,
}: {
	ctx: TestContext;
	customer: TestCustomer;
	productId: string;
}) => {
	const customerProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId: customer.internal_id,
		inStatuses: ALL_STATUSES,
	});
	return customerProducts.find(
		(customerProduct) => customerProduct.product.id === productId,
	);
};

export const getPendingDeferredInvoice = async ({
	ctx,
	customer,
	productId,
}: {
	ctx: TestContext;
	customer: TestCustomer;
	productId: string;
}): Promise<{
	metadata: Metadata;
	stripeInvoice: Stripe.Invoice;
	stripeSubscriptionId: string;
}> => {
	const pendingCustomerProduct = await findCustomerProduct({
		ctx,
		customer,
		productId,
	});
	expect(pendingCustomerProduct?.status).toBe(CusProductStatus.Pending);

	const metadata = await MetadataService.get({
		db: ctx.db,
		id: pendingCustomerProduct?.metadata_id ?? "",
	});
	expect(metadata?.stripe_invoice_id).toBeTruthy();

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		metadata!.stripe_invoice_id!,
	);
	const stripeSubscriptionId =
		stripeInvoiceToStripeSubscriptionId(stripeInvoice);
	expect(stripeSubscriptionId).toBeTruthy();

	return {
		metadata: metadata!,
		stripeInvoice,
		stripeSubscriptionId: stripeSubscriptionId!,
	};
};

/** Asserts the unpaid deferred plan was expired and its invoice/metadata cleaned up. */
export const expectUnpaidDeferredInvoiceCleanedUp = async ({
	ctx,
	customer,
	productId,
	metadataId,
	stripeInvoiceId,
	stripeSubscriptionId,
	stripeSubscriptionStatus,
}: {
	ctx: TestContext;
	customer: TestCustomer;
	productId: string;
	metadataId: string;
	stripeInvoiceId: string;
	stripeSubscriptionId: string;
	stripeSubscriptionStatus: Stripe.Subscription.Status;
}) => {
	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(stripeInvoiceId);
	expect(stripeInvoice.status).toBe("void");

	const expiredCustomerProduct = await findCustomerProduct({
		ctx,
		customer,
		productId,
	});
	expect(expiredCustomerProduct?.status).toBe(CusProductStatus.Expired);
	expect(expiredCustomerProduct?.metadata_id).toBeNull();

	const stripeSubscription =
		await ctx.stripeCli.subscriptions.retrieve(stripeSubscriptionId);
	expect(stripeSubscription.status).toBe(stripeSubscriptionStatus);

	const metadata = await MetadataService.get({ db: ctx.db, id: metadataId });
	expect(metadata).toBeNull();
};

export const expectCustomerProductStatus = async ({
	ctx,
	customer,
	productId,
	status,
}: {
	ctx: TestContext;
	customer: TestCustomer;
	productId: string;
	status: CusProductStatus;
}) => {
	const customerProduct = await findCustomerProduct({
		ctx,
		customer,
		productId,
	});
	expect(customerProduct?.status).toBe(status);
};
