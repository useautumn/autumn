import { expect } from "bun:test";
import {
	type ApiCustomerV3,
	type BillingResponse,
	CusProductStatus,
} from "@autumn/shared";
import { expectBackdatedStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectBackdatedStripeSubscriptionCorrect";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type { AutumnInt } from "@/external/autumn/autumnCli";
import { getCustomerProduct } from ".";

export const expectAttachBackdateCorrect = async ({
	autumn,
	ctx,
	customerId,
	productId,
	startsAt,
	result,
	minInvoiceTotal = 2000,
	minInvoiceLineCount,
	expectedInvoiceCount = 1,
}: {
	autumn: AutumnInt;
	ctx: TestContext;
	customerId: string;
	productId: string;
	startsAt: number;
	result: BillingResponse;
	minInvoiceTotal?: number;
	minInvoiceLineCount?: number;
	expectedInvoiceCount?: number;
}) => {
	expect(result.invoice?.stripe_id).toBeDefined();
	expect(result.invoice?.total).toBeGreaterThan(minInvoiceTotal / 100);

	const customer = await autumn.customers.get<ApiCustomerV3>(customerId);
	expect(customer.invoices).toHaveLength(expectedInvoiceCount);

	const cusProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId,
	});
	expect(cusProduct.status).toBe(CusProductStatus.Active);
	expect(cusProduct.starts_at).toBe(startsAt);
	expect(cusProduct.scheduled_ids ?? []).toEqual([]);
	expect(cusProduct.subscription_ids).toHaveLength(1);

	await expectBackdatedStripeSubscriptionCorrect({
		ctx,
		stripeSubscriptionId: cusProduct.subscription_ids![0]!,
		startsAt,
		stripeInvoiceId: result.invoice!.stripe_id,
		minInvoiceTotal,
		minInvoiceLineCount,
	});

	return cusProduct;
};
