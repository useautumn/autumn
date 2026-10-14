import {
	cusProductToProcessorType,
	ProcessorType,
	RecaseError,
} from "@autumn/shared";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";

export const handleExternalPSPErrors = ({
	attachParams,
	strict = false,
}: {
	attachParams: AttachParams;
	strict?: boolean;
}) => {
	const oneOffEscape =
		!strict &&
		attachParams.products.length === 1 &&
		pricesOnlyOneOff(attachParams.prices);

	if (oneOffEscape) return;

	if (
		attachParams.customer.customer_products.some(
			(cp) => cusProductToProcessorType(cp) !== ProcessorType.Stripe,
		)
	) {
		throw new RecaseError({
			message:
				"This customer is billed outside of Stripe, please use the origin platform to manage their billing.",
			statusCode: 400,
		});
	}
};
