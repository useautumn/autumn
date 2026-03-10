import { type Checkout, CheckoutStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkoutRepo } from "../repos/checkoutRepo";
import {
	deleteCheckoutCache,
	setCheckoutCache,
} from "./cache/checkoutCacheActions";

export const updateCheckoutDbAndCache = async ({
	ctx,
	oldCheckout,
	updates,
}: {
	ctx: AutumnContext;
	oldCheckout: Checkout;
	updates: Partial<Checkout>;
}) => {
	const newCheckout = { ...oldCheckout, ...updates };

	const updatedCheckout = await checkoutRepo.update({
		db: ctx.db,
		id: newCheckout.id,
		updates: newCheckout,
	});

	if (!updatedCheckout) {
		return null;
	}

	if (
		updates.status === CheckoutStatus.Completed ||
		updates.status === CheckoutStatus.Expired
	) {
		await deleteCheckoutCache({ checkoutId: updatedCheckout.id });
		return updatedCheckout;
	}

	await setCheckoutCache({
		checkoutId: updatedCheckout.id,
		data: updatedCheckout,
	});

	return updatedCheckout;
};
