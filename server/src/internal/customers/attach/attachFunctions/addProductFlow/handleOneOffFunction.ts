import {
	type AttachConfig,
	type AttachFunctionResponse,
	AttachFunctionResponseSchema,
	MetadataType,
	SuccessCode,
	type UsagePriceConfig,
} from "@autumn/shared";
import { addMinutes } from "date-fns";
import { Decimal } from "decimal.js";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { newPriceToInvoiceDescription } from "@/internal/invoices/invoiceFormatUtils.js";
import { buildInvoiceMemoFromEntitlements } from "@/internal/invoices/invoiceMemoUtils.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import { orgToCurrency } from "@/internal/orgs/orgUtils.js";
import { priceToProduct } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { isFixedPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { getPriceOptions } from "@/internal/products/prices/priceUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { attachParamsToMetadata } from "../../../../billing/attach/utils/attachParamsToMetadata";
import { getCustomerDisplay } from "../../../../billing/attach/utils/getCustomerDisplay";

export const handleOneOffFunction = async ({
	ctx,
	attachParams,
	config,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
}): Promise<AttachFunctionResponse> => {
	const { logger } = ctx;

	logger.info("Scenario 4A: One-off prices");

	const {
		stripeCli,
		paymentMethod,
		org,
		customer,
		products,
		prices,
		entitlements,
		optionsList,
		rewards,
	} = attachParams;

	const { invoiceOnly } = config;

	const invoiceItems = [];

	for (const price of prices) {
		const options = getPriceOptions(price, optionsList);
		let quantity = options?.quantity;

		if (quantity) {
			const config = price.config as UsagePriceConfig;
			quantity = new Decimal(quantity)
				.mul(config.billing_units || 1)
				.toNumber();
		}

		let invoiceItemData = {};
		if (isFixedPrice({ price })) {
			quantity = 1;

			invoiceItemData = {
				pricing: {
					price: price.config.stripe_price_id,
				},
				quantity: 1,
			};
		} else {
			const amount = priceToInvoiceAmount({
				price,
				quantity,
			});

			const product = priceToProduct({
				price,
				products,
			});

			const description = newPriceToInvoiceDescription({
				org,
				price,
				product: product!,
				ents: entitlements,
				quantity: options?.quantity,
				withProductPrefix: true,
			});

			invoiceItemData = {
				description,
				price_data: {
					unit_amount: new Decimal(amount).mul(100).round().toNumber(),
					currency: orgToCurrency({ org }),
					product: price.config?.stripe_product_id || product?.processor?.id,
				},
			};
		}

		invoiceItems.push({
			...invoiceItemData,
			quantity: 1,
		});
	}

	let shouldMemo = false;
	let invoiceMemo = "";
	try {
		shouldMemo = attachParams.org.config.invoice_memos && invoiceOnly;
		invoiceMemo = shouldMemo
			? await buildInvoiceMemoFromEntitlements({
					org: attachParams.org,
					entitlements: attachParams.entitlements,
					features: attachParams.features,
					prices: attachParams.prices,
					logger,
				})
			: "";
	} catch (error) {
		logger.error("ONE OFF FUNCTION: error adding invoice memo", {
			error,
		});
	}

	// Create invoice
	logger.info("1. Creating invoice");
	let stripeInvoice = await stripeCli.invoices.create({
		customer: customer.processor.id!,
		auto_advance: false,
		currency: orgToCurrency({ org }),
		discounts: rewards ? rewards.map((r) => ({ coupon: r.id })) : undefined,
		collection_method: attachParams.invoiceOnly ? "send_invoice" : undefined,
		days_until_due: attachParams.invoiceOnly ? 30 : undefined,
		...(shouldMemo ? { description: invoiceMemo } : {}),
	});

	logger.info("2. Creating invoice items");
	for (const invoiceItem of invoiceItems) {
		await stripeCli.invoiceItems.create({
			...invoiceItem,
			customer: customer.processor.id!,
			invoice: stripeInvoice.id,
		});
	}

	if (config.invoiceCheckout) {
		if (stripeInvoice.status === "draft" && config.finalizeInvoice) {
			stripeInvoice = await stripeCli.invoices.finalizeInvoice(
				stripeInvoice.id!,
			);
		}

		await insertInvoiceFromAttach({
			db: ctx.db,
			attachParams,
			invoiceId: stripeInvoice.id,
			logger,
		});

		return AttachFunctionResponseSchema.parse({
			invoice: stripeInvoice,
		});
	}

	logger.info("3. Creating invoice from stripe");
	await insertInvoiceFromAttach({
		db: ctx.db,
		attachParams,
		invoiceId: stripeInvoice.id,
		logger,
	});

	// Create invoice items
	if (!invoiceOnly) {
		stripeInvoice = await stripeCli.invoices.finalizeInvoice(stripeInvoice.id!);

		logger.info("4. Paying invoice");
		const {
			paid,
			error,
			invoice: paidInvoice,
		} = await payForInvoice({
			stripeCli,
			invoiceId: stripeInvoice.id!,
			paymentMethod,
			logger,
			errorOnFail: false,
			voidIfFailed: false,
		});

		if (paidInvoice) {
			stripeInvoice = paidInvoice;
		}

		if (!paid) {
			// Check if invoice is still open (payment failed but invoice not voided)
			if (stripeInvoice && stripeInvoice.status === "open") {
				logger.info(
					`[one off function] invoice action required: ${stripeInvoice.id}`,
				);
				const metadata = await attachParamsToMetadata({
					db: ctx.db,
					attachParams,
					type: MetadataType.InvoiceActionRequired,
					stripeInvoiceId: stripeInvoice.id as string,
					expiresAt: addMinutes(Date.now(), 10).getTime(),
				});

				await stripeCli.invoices.update(stripeInvoice.id, {
					metadata: {
						autumn_metadata_id: metadata.id,
					},
				});

				return AttachFunctionResponseSchema.parse({
					checkout_url: stripeInvoice.hosted_invoice_url,
					code: SuccessCode.InvoiceActionRequired,
					message: "Payment action required",
				});
			}

			if (org.config.checkout_on_failed_payment) {
				return await handleCreateCheckout({
					ctx,
					attachParams,
					config,
				});
			}
			throw error;
		}
	}

	logger.info("6. Creating full customer product");
	const batchInsert = [];
	for (const product of products) {
		batchInsert.push(
			createFullCusProduct({
				db: ctx.db,
				attachParams: attachToInsertParams(attachParams, product),
				logger,
			}),
		);
	}
	await Promise.all(batchInsert);

	const customerName = getCustomerDisplay({ customer });
	const productNames = products.map((p) => p.name).join(", ");
	return AttachFunctionResponseSchema.parse({
		// success: true,
		message: `Successfully purchased product(s) ${productNames} and attached to customer ${customerName}`,
		invoice: invoiceOnly ? stripeInvoice : undefined,
		code: SuccessCode.OneOffProductAttached,
	});
};
