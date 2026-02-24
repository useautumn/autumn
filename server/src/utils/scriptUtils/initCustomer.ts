import type Stripe from "stripe";

export const attachPaymentMethod = async ({
	stripeCli,
	stripeCusId,
	type,
}: {
	stripeCli: Stripe;
	stripeCusId: string;
	type: "success" | "fail" | "authenticate" | "alipay";
}) => {
	try {
		// Use pre-defined payment method IDs for special test cards
		if (type === "authenticate" || type === "fail") {
			const pmId =
				type === "authenticate"
					? "pm_card_authenticationRequired"
					: "pm_card_chargeCustomerFail";

			await stripeCli.paymentMethods.attach(pmId, {
				customer: stripeCusId,
			});

			const pms = await stripeCli.paymentMethods.list({
				customer: stripeCusId,
			});

			await stripeCli.customers.update(stripeCusId, {
				invoice_settings: {
					default_payment_method: pms.data[0].id,
				},
			});
			return;
		}

		// Alipay case - create and attach alipay payment method
		if (type === "alipay") {
			const pm = await stripeCli.paymentMethods.create({
				type: "alipay",
			});

			await stripeCli.paymentMethods.attach(pm.id, {
				customer: stripeCusId,
			});
			return;
		}

		// Success case - create from token
		const pm = await stripeCli.paymentMethods.create({
			type: "card",
			card: {
				token: "tok_visa",
			},
		});

		await stripeCli.paymentMethods.attach(pm.id, {
			customer: stripeCusId,
		});

		await stripeCli.customers.update(stripeCusId, {
			invoice_settings: {
				default_payment_method: pm.id,
			},
		});
	} catch (error) {
		console.log("failed to attach payment method", error);
	}
};
