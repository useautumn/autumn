import type { InsertCustomerProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateCachedCustomerProductV2 } from "../../cache/fullSubject/actions/updateCachedCustomerProduct.js";
import { CusProductService } from "../CusProductService.js";

export const updateCustomerProductDbAndCache = async ({
	ctx,
	customerId,
	cusProductId,
	updates,
}: {
	ctx: AutumnContext;
	customerId: string;
	cusProductId: string;
	updates: Partial<InsertCustomerProduct>;
}) => {
	await CusProductService.update({
		ctx,
		cusProductId,
		updates,
	});

	await Promise.all([
		updateCachedCustomerProductV2({
			ctx,
			customerId,
			customerProductId: cusProductId,
			updates,
		}),
	]);
};
