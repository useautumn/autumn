import {
	type AppEnv,
	CusExpand,
	type FullCustomer,
	type Organization,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";

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

	const stripeCli = createStripeCli({
		org,
		env,
	});

	const paymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: fullCus.processor?.id,
		errorIfNone: false,
	});

	return paymentMethod;
};
