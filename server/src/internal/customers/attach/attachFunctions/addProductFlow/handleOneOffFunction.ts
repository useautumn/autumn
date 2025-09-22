import { AttachResultSchema } from "@/internal/customers/cusProducts/AttachParams.js";
import { AttachScenario, UsagePriceConfig } from "@autumn/shared";
import { SuccessCode } from "@autumn/shared";

import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { newPriceToInvoiceDescription } from "@/internal/invoices/invoiceFormatUtils.js";
import { getPriceOptions } from "@/internal/products/prices/priceUtils.js";
import { priceToProduct } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { AttachConfig } from "@autumn/shared";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import {
	attachToInvoiceResponse,
	insertInvoiceFromAttach,
} from "@/internal/invoices/invoiceUtils.js";
import { Decimal } from "decimal.js";
import { isFixedPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { buildInvoiceMemoFromEntitlements } from "@/internal/invoices/invoiceMemoUtils.js";

export const handleOneOffFunction = async ({
	req,
	attachParams,
	config,
	res,
}: {
	req: any;
	attachParams: AttachParams;
	config: AttachConfig;
	res: any;
}) => {
	const logger = req.logtail;
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

	let invoiceItems = [];

	for (const price of prices) {
		const options = getPriceOptions(price, optionsList);
		let quantity = options?.quantity;

		if (quantity) {
			let config = price.config as UsagePriceConfig;
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
					currency: org.default_currency,
					product: price.config?.stripe_product_id || product?.processor?.id!,
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
		currency: org.default_currency!,
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
		} as any);
	}

	if (config.invoiceCheckout) {
		if (stripeInvoice.status === "draft" && config.finalizeInvoice) {
			stripeInvoice = await stripeCli.invoices.finalizeInvoice(
				stripeInvoice.id!,
			);
		}

		await insertInvoiceFromAttach({
			db: req.db,
			attachParams,
			invoiceId: stripeInvoice.id,
			logger,
		});

		return { invoices: [stripeInvoice], subs: [], anchorToUnix: undefined };
	}

	// Create invoice items
	if (!invoiceOnly) {
		await stripeCli.invoices.finalizeInvoice(stripeInvoice.id!);

		logger.info("3. Paying invoice");
		const { paid, error } = await payForInvoice({
			stripeCli,
			invoiceId: stripeInvoice.id!,
			paymentMethod,
			logger,
			errorOnFail: false,
			voidIfFailed: true,
		});

		if (!paid) {
			if (org.config.checkout_on_failed_payment) {
				return await handleCreateCheckout({
					req,
					res,
					attachParams,
					config,
				});
			}
			throw error;
		}
	}

	logger.info("4. Creating full customer product");
	const batchInsert = [];
	for (const product of products) {
		batchInsert.push(
			createFullCusProduct({
				db: req.db,
				attachParams: attachToInsertParams(attachParams, product),
				logger,
			}),
		);
	}
	await Promise.all(batchInsert);

	logger.info("5. Creating invoice from stripe");
	await insertInvoiceFromAttach({
		db: req.db,
		attachParams,
		invoiceId: stripeInvoice.id,
		logger,
	});

	if (res) {
		const productNames = products.map((p) => p.name).join(", ");
		const customerName = customer.name || customer.email || customer.id;
		res.status(200).json(
			AttachResultSchema.parse({
				success: true,
				message: `Successfully purchased ${productNames} and attached to ${customerName}`,
				invoice: invoiceOnly
					? attachToInvoiceResponse({ invoice: stripeInvoice })
					: undefined,
				code: SuccessCode.OneOffProductAttached,
				product_ids: products.map((p) => p.id),
				customer_id: customer.id || customer.internal_id,
				scenario: AttachScenario.New,
			}),
		);
	}
};
