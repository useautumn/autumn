import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AppEnv, CusExpand, FullCustomer, Organization } from "@autumn/shared";

export const getCusPaymentMethodRes = async ({
	org,
	env,
	fullCus,
	expand,
}: {
	org: Organization;
	env: AppEnv;
	fullCus: FullCustomer;
	expand: CusExpand[];
}) => {
	if (!expand?.includes(CusExpand.PaymentMethod)) {
		return undefined;
	}

	let stripeCli = createStripeCli({
		org,
		env,
	});

	let paymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: fullCus.processor?.id,
		errorIfNone: false,
	});

	return paymentMethod;
};
