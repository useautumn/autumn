import {
	type AttachBranch,
	type AttachConfig,
	type AttachFunctionResponse,
	AttachFunctionResponseSchema,
	MetadataType,
	SuccessCode,
} from "@autumn/shared";
import { addMonths } from "date-fns";
import { isOneOff } from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { attachParamsToMetadata } from "../../billing/attach/utils/attachParamsToMetadata.js";
import { handleOneOffFunction } from "../attach/attachFunctions/addProductFlow/handleOneOffFunction.js";
import { handlePaidProduct } from "../attach/attachFunctions/addProductFlow/handlePaidProduct.js";
import type { AttachParams } from "../cusProducts/AttachParams.js";

export const handleCreateInvoiceCheckout = async ({
	ctx,
	attachParams,
	config,
	branch,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
	branch: AttachBranch;
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
			branch,
		});
	}

	const { invoice, stripeSub, anchorToUnix } = invoiceResult;

	const metadata = await attachParamsToMetadata({
		db: ctx.db,
		attachParams: {
			...attachParams,
			anchorToUnix,
			subId: stripeSub?.id,
			config,
		},
		type: MetadataType.InvoiceCheckout,
		stripeInvoiceId: invoice?.id,
		expiresAt: addMonths(Date.now(), 1).getTime(),
	});

	if (invoice) {
		await stripeCli.invoices.update(invoice.id, {
			metadata: {
				autumn_metadata_id: metadata.id,
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
	});
};
