import { CusProductStatus, type FullSubject } from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";

export const getCheckSubject = ({
	ctx,
	fullSubject,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
}): FullSubject => {
	if (!ctx.org.config.block_overdue_entitlements) return fullSubject;

	return {
		...fullSubject,
		customer_products: fullSubject.customer_products.filter(
			(customerProduct) => customerProduct.status !== CusProductStatus.PastDue,
		),
	};
};
