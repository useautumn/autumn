import {
	STRIPE_THREE_DECIMAL_CURRENCIES,
	stripeMinorUnitFactor,
} from "@utils/currencyUtils/stripeCurrencies.js";
import { Decimal } from "decimal.js";

/**
 * Converts an Autumn amount to a Stripe integer amount (`amount` / `unit_amount`).
 * Multiplies by the currency's minor-unit factor: 1 (JPY), 100 (USD), 1000 (BHD).
 * Three-decimal currencies must be evenly divisible by ten, so they are rounded
 * to two decimals of precision before scaling.
 */
export const atmnToStripeAmount = ({
	amount,
	currency = "USD",
}: {
	amount: number;
	currency?: string;
}): number => {
	if (STRIPE_THREE_DECIMAL_CURRENCIES.has(currency.toLowerCase())) {
		return new Decimal(amount).mul(100).round().mul(10).toNumber();
	}
	return new Decimal(amount)
		.mul(stripeMinorUnitFactor(currency))
		.round()
		.toNumber();
};

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
	return decimal
		.mul(stripeMinorUnitFactor(currency))
		.toDecimalPlaces(decimalPlaces)
		.toString();
};

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
	const finalAmount = new Decimal(amount)
		.div(stripeMinorUnitFactor(currency))
		.toNumber();

	if (round) {
		return new Decimal(finalAmount).toDecimalPlaces(decimalPlaces).toNumber();
	}

	if (decimalPlaces) {
		return new Decimal(finalAmount).toDecimalPlaces(decimalPlaces).toNumber();
	}

	return finalAmount;
};
