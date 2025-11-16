import type { Stripe } from "stripe";

export const deleteCouponFromSub = async ({
	stripeCli,
	stripeSubId,
	discountId,
	logger,
}: {
	stripeCli: Stripe;
	stripeSubId: string;
	discountId: string;
	logger: any;
}) => {
	try {
		const stripeSub = await stripeCli.subscriptions.retrieve(stripeSubId);

		if (stripeSub.discounts.some((d: any) => d === discountId)) {
			await stripeCli.subscriptions.deleteDiscount(stripeSubId);
		}
	} catch (error: any) {
		logger.error(`Failed to delete discount from subscription ${stripeSubId}`);
		logger.error(error.message);
	}
};

export const deleteCouponFromCus = async ({
	stripeCli,
	stripeSubId,
	stripeCusId,
	discountId,
	logger,
}: {
	stripeCli: Stripe;
	stripeSubId: string;
	stripeCusId: string;
	discountId: string;
	logger: any;
}) => {
	try {
		const stripeSub = await stripeCli.subscriptions.retrieve(stripeSubId);
		if (stripeSub.discounts.some((d: any) => d === discountId)) {
			await stripeCli.subscriptions.deleteDiscount(stripeSubId);
		}
	} catch (error) {
		logger.error(`Failed to delete discount from subscription ${stripeSubId}`);
		logger.error(error);
	}

	try {
		const stripeCus = (await stripeCli.customers.retrieve(
			stripeCusId,
		)) as Stripe.Customer;
		if (stripeCus.discount?.id === discountId) {
			await stripeCli.customers.deleteDiscount(stripeCusId, discountId);
		}
	} catch (error) {
		logger.error(`Failed to delete discount from customer ${stripeCusId}`);
		logger.error(error);
	}
};
