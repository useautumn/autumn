import {
	type AttachConfig,
	type AttachFunctionResponse,
	AttachFunctionResponseSchema,
	SuccessCode,
} from "@autumn/shared";
import { createCheckoutMetadata } from "@/internal/metadata/metadataUtils.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { handleOneOffFunction } from "../attach/attachFunctions/addProductFlow/handleOneOffFunction.js";
import { handlePaidProduct } from "../attach/attachFunctions/addProductFlow/handlePaidProduct.js";
import type { AttachParams } from "../cusProducts/AttachParams.js";

export const handleCreateInvoiceCheckout = async ({
	ctx,
	attachParams,
	config,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
}): Promise<AttachFunctionResponse> => {
	// if one off
	const { stripeCli } = attachParams;

	let invoiceResult: AttachFunctionResponse;

	if (isOneOff(attachParams.prices)) {
		invoiceResult = await handleOneOffFunction({
			ctx,
			attachParams,
			config,
		});
	} else {
		invoiceResult = await handlePaidProduct({
			ctx,
			attachParams,
			config,
		});
	}

	// const { invoices, anchorToUnix, subs } = invoiceResult;
	const { invoice, stripeSub, anchorToUnix } = invoiceResult;

	// console.log("finalize invoice:", config.finalizeInvoice);
	// console.log("invoice hosted url:", invoice?.hosted_invoice_url);

	const metadataId = await createCheckoutMetadata({
		db: ctx.db,
		attachParams: {
			...attachParams,
			anchorToUnix,
			subId: stripeSub?.id,
			config,
		},
	});

	if (invoice) {
		await stripeCli.invoices.update(invoice.id, {
			metadata: {
				autumn_metadata_id: metadataId,
			},
		});
	}

	const customerId =
		attachParams.customer.id || attachParams.customer.internal_id;
	const productNames = attachParams.products.map((p) => p.name).join(", ");
	return AttachFunctionResponseSchema.parse({
		checkout_url: config.finalizeInvoice
			? invoice?.hosted_invoice_url
			: undefined,
		message: `Successfully created invoice checkout for customer ${customerId}, product(s) ${productNames}`,
		code: SuccessCode.CheckoutCreated,
		invoice: config.finalizeInvoice ? undefined : invoice, // if finalizeInvoice, checkout_url is used
		// invoice,
		// stripeSub,
		// anchorToUnix,
		// config,
	});

	// if (res) {
	// 	if (!config.finalizeInvoice) {
	// 		res.status(200).json(
	// 			AttachResultSchema.parse({
	// 				invoice: invoices[0],
	// 				code: SuccessCode.CheckoutCreated,
	// 				message: `Successfully created invoice for customer ${
	// 					attachParams.customer.id || attachParams.customer.internal_id
	// 				}, product(s) ${attachParams.products.map((p) => p.name).join(", ")}`,
	// 				product_ids: attachParams.products.map((p) => p.id),
	// 				customer_id:
	// 					attachParams.customer.id || attachParams.customer.internal_id,
	// 			}),
	// 		);
	// 		return;
	// 	}
	// 	res.status(200).json(
	// 		AttachResultSchema.parse({
	// 			checkout_url: invoices[0].hosted_invoice_url,
	// 			code: SuccessCode.CheckoutCreated,
	// 			message: `Successfully created invoice checkout for customer ${
	// 				attachParams.customer.id || attachParams.customer.internal_id
	// 			}, product(s) ${attachParams.products.map((p) => p.name).join(", ")}`,
	// 			product_ids: attachParams.products.map((p) => p.id),
	// 			customer_id:
	// 				attachParams.customer.id || attachParams.customer.internal_id,
	// 		}),
	// 	);
	// }

	// return { invoices };
};

// if (attachParams.productsList) {
// 	invoiceResult = await handleMultiAttachFlow({
// 		req,
// 		res,
// 		attachParams,
// 		attachBody,
// 		branch,
// 		config,
// 	});
// } else
