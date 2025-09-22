export const isStripeCardDeclined = (error: any) => {
	return (
		error.code === "card_declined" ||
		error.code === "expired_card" ||
		error.code === "incorrect_cvc" ||
		error.code === "processing_error" ||
		error.code === "incorrect_number" ||
		error.code == "subscription_payment_intent_requires_action" ||
		error.code == "payment_intent_payment_attempt_failed" // Stripe link
	);
};
