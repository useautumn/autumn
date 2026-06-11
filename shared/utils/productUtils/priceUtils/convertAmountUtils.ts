import type { StripeDecimal } from "@models/billingModels/stripe/stripeDecimal";
import { Decimal as DecimalJS } from "decimal.js";
import Stripe from "stripe";

type DecimalLike = { toString(): string };
/**
 * Zero-decimal currencies that Stripe handles without decimal places.
 * These currencies don't require multiplying/dividing by 100.
 */
const ZERO_DECIMAL_CURRENCIES = [
	"BIF", // Burundian Franc
	"CLP", // Chilean Peso
	"DJF", // Djiboutian Franc
	"GNF", // Guinean Franc
	"JPY", // Japanese Yen
	"KMF", // Comorian Franc
	"KRW", // South Korean Won
	"MGA", // Malagasy Ariary
	"PYG", // Paraguayan Guaraní
	"RWF", // Rwandan Franc
	"UGX", // Ugandan Shilling
	"VND", // Vietnamese Đồng
	"VUV", // Vanuatu Vatu
	"XAF", // Central African CFA Franc
	"XOF", // West African CFA Franc
	"XPF", // CFP Franc
];

/**
 * Converts an Autumn amount to a Stripe amount.
 * For most currencies, multiplies by 100 (e.g., $1.00 -> 100 cents).
 * For zero-decimal currencies like JPY, rounds to the nearest integer.
 */
export const atmnToStripeAmount = ({
	amount,
	currency = "USD",
}: {
	amount: number;
	currency?: string;
}): number => {
	if (ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase())) {
		return new DecimalJS(amount).round().toNumber();
	}
	return new DecimalJS(amount).mul(100).round().toNumber();
};

/**
 * Converts an Autumn amount to a Stripe Decimal class.
 * For most currencies, multiplies by 100 and returns as string with decimal places.
 * For zero-decimal currencies like JPY, returns the amount as-is with decimal places.
 * Used for Stripe API calls that require unit_amount_decimal as a string.
 */
export const atmnToStripeAmountDecimal = ({
	amount,
	currency = "USD",
	decimalPlaces = 10,
}: {
	amount: number | DecimalJS;
	currency?: string;
	decimalPlaces?: number;
}): StripeDecimal => {
	const decimal = amount instanceof DecimalJS ? amount : new DecimalJS(amount);

	if (ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase())) {
		return Stripe.Decimal.from(
			decimal.toDecimalPlaces(decimalPlaces).toString(),
		);
	}
	return Stripe.Decimal.from(
		decimal.mul(100).toDecimalPlaces(decimalPlaces).toString(),
	);
};

/**
 * Converts a Stripe amount to an Autumn amount.
 * For most currencies, divides by 100 (e.g., 100 cents -> $1.00).
 * For zero-decimal currencies like JPY, returns the amount as-is.
 */
export const stripeToAtmnAmount = ({
	amount,
	currency = "usd",
	decimalPlaces = 10,
	round = true,
}: {
	amount: number | string | DecimalLike;
	currency?: string;
	decimalPlaces?: number;
	round?: boolean;
}): number => {
	let finalAmount = new DecimalJS(
		typeof amount === "number" ? amount : amount.toString(),
	);

	if (!ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase())) {
		finalAmount = finalAmount.div(100);
	}

	if (round) {
		return finalAmount.toDecimalPlaces(decimalPlaces).toNumber();
	}

	if (decimalPlaces) {
		return finalAmount.toDecimalPlaces(decimalPlaces).toNumber();
	}

	return finalAmount.toNumber();
};
