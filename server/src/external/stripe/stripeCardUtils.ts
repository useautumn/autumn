export const isStripeCardDeclined = (error: any) => {
  return (
    error.code === "card_declined" ||
    error.code === "expired_card" ||
    error.code === "incorrect_cvc" ||
    error.code === "processing_error" ||
    error.code === "incorrect_number"
  );
};
