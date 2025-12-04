export enum AppEnv {
	Sandbox = "sandbox",
	Live = "live",
}

export enum Duration {
	Minute = "minute",
	Hour = "hour",
	Day = "day",
	Week = "week",
	Month = "month",
	Year = "year",
	Lifetime = "lifetime",
}

/**
 * Payment processor types supported by the system
 * 
 * This enum can be extended to support additional payment providers
 * (e.g., PayPal, Paddle, etc.) as they are integrated.
 */
export enum ProcessorType {
	Stripe = "stripe",
	// Future providers can be added here:
	// PayPal = "paypal",
	// Paddle = "paddle",
}
