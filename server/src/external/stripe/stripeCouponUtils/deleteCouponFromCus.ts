import { Stripe } from "stripe";

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
		let stripeSub = await stripeCli.subscriptions.retrieve(stripeSubId);

		let newDiscounts = stripeSub.discounts
			?.filter((d: any) => d !== discountId)
			.map((d: any) => ({
				discount: d,
			}));

		if (stripeSub.discounts.some((d: any) => d === discountId)) {
			await stripeCli.subscriptions.deleteDiscount(stripeSubId);
			// console.log("DELETED DISCOUNT FROM SUB", stripeSubId);
		}
	} catch (error: any) {
		// if (!error.message.includes("no active discount for subscription")) {
		logger.error(`Failed to delete discount from subscription ${stripeSubId}`);
		logger.error(error.message);
		// }
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
		let stripeSub = await stripeCli.subscriptions.retrieve(stripeSubId);
		if (stripeSub.discounts.some((d: any) => d === discountId)) {
			await stripeCli.subscriptions.deleteDiscount(stripeSubId);
		}
	} catch (error) {
		logger.error(`Failed to delete discount from subscription ${stripeSubId}`);
		logger.error(error);
	}

	try {
		let stripeCus = (await stripeCli.customers.retrieve(
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
