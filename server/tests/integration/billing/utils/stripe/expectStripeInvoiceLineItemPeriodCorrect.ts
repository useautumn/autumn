import { expect } from "bun:test";
import { CusExpand } from "@shared/index";
import { isUsagePrice, ms } from "@shared/utils";
import { formatMs } from "@shared/utils/common/formatUtils/formatUnix";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService";
import { findPriceFromStripeId } from "@/internal/products/prices/priceUtils/findPriceUtils";

/**
 * Check that Stripe invoice line items have correct billing period (start -> end).
 * Verifies that the period spans approximately 1 month.
 */
export const expectStripeInvoiceLineItemPeriodCorrect = async ({
	customerId,
	productId,
	featureId,
	periodStartMs,
	periodEndMs,
}: {
	customerId: string;
	productId: string;
	featureId?: string;
	periodStartMs: number;
	periodEndMs: number;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId ?? "",
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const usagePrices = fullProduct.prices.filter(
		(p) =>
			isUsagePrice({ price: p }) &&
			(featureId ? p.config.feature_id === featureId : true),
	);

	const customer = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
		expand: [CusExpand.Invoices],
	});

	const stripeInvoice = await getStripeInvoice({
		stripeClient: stripeCli,
		invoiceId: customer.invoices?.[0]?.stripe_id ?? "",
		expand: ["discounts"],
	});

	const usageLineItems = stripeInvoice.lines.data.filter((line) =>
		usagePrices.some((p) =>
			Boolean(
				findPriceFromStripeId({
					prices: usagePrices,
					stripePriceId: line.pricing?.price_details?.price ?? "",
				}),
			),
		),
	);

	const TOLERANCE_MS = ms.days(1);

	for (const line of usageLineItems) {
		const periodStart = line.period.start * 1000;
		const periodEnd = line.period.end * 1000;
		expect(periodStart).toBeDefined();
		expect(periodEnd).toBeDefined();

		const startDiff = Math.abs(periodStart - periodStartMs);
		const endDiff = Math.abs(periodEnd - periodEndMs);

		if (startDiff > TOLERANCE_MS) {
			throw new Error(
				`Period start mismatch: expected ${formatMs(periodStartMs)}, got ${formatMs(periodStart)} (diff: ${startDiff}ms)`,
			);
		}
		if (endDiff > TOLERANCE_MS) {
			throw new Error(
				`Period end mismatch: expected ${formatMs(periodEndMs)}, got ${formatMs(periodEnd)} (diff: ${endDiff}ms)`,
			);
		}
	}
};
