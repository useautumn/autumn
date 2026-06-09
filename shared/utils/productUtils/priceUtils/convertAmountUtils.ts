import { Decimal } from "decimal.js";

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
 * For zero-decimal currencies like JPY, returns the amount as-is.
 */
export const atmnToStripeAmount = ({
	amount,
	currency = "USD",
}: {
	amount: number;
	currency?: string;
}): number => {
	if (ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase())) {
		return amount;
	}
	return new Decimal(amount).mul(100).round().toNumber();
};

/**
 * Converts an Autumn amount to a Stripe decimal string.
 * For most currencies, multiplies by 100 and returns as string with decimal places.
 * For zero-decimal currencies like JPY, returns the amount as-is with decimal places.
 * Used for Stripe API calls that require unit_amount_decimal as a string.
 */
export const atmnToStripeAmountDecimal = ({
	amount,
	currency = "USD",
	decimalPlaces = 10,
}: {
	amount: number | Decimal;
	currency?: string;
	decimalPlaces?: number;
}): string => {
	const decimal = amount instanceof Decimal ? amount : new Decimal(amount);

	if (ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase())) {
		return decimal.toDecimalPlaces(decimalPlaces).toString();
	}
	return decimal.mul(100).toDecimalPlaces(decimalPlaces).toString();
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
	amount: number;
	currency?: string;
	decimalPlaces?: number;
	round?: boolean;
}): number => {
	let finalAmount = amount;

	if (!ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase())) {
		finalAmount = new Decimal(amount).div(100).toNumber();
	}

	if (round) {
		return new Decimal(finalAmount).toDecimalPlaces(decimalPlaces).toNumber();
	}

	if (decimalPlaces) {
		return new Decimal(finalAmount).toDecimalPlaces(decimalPlaces).toNumber();
	}

	return finalAmount;
};
