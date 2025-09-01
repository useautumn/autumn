import type { Customer, Feature } from "@autumn/shared";
import { BillingType, type Price, type UsagePriceConfig } from "@autumn/shared";
import type Stripe from "stripe";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";

export const submitUsageToStripe = async ({
	price,
	stripeCli,
	usage,
	customer,
	usageTimestamp,
	feature,
	logger,
}: {
	stripeCli: Stripe;
	price: Price;
	usage: number;
	customer: Customer;
	usageTimestamp?: number;
	feature: Feature;
	logger: any;
}) => {
	const config = price.config as UsagePriceConfig;
	const billingType = getBillingType(config);

	if (billingType !== BillingType.UsageInArrear) {
		logger.warn(
			`Price ${price.id} is not usage in arrear type, can't send usage`,
		);
	}
	const stripeMeter = await stripeCli.billing.meters.retrieve(
		config.stripe_meter_id!,
	);

	await stripeCli.billing.meterEvents.create({
		event_name: stripeMeter.event_name,
		payload: {
			stripe_customer_id: customer.processor.id,
			value: usage.toString(),
		},
		timestamp: usageTimestamp || Math.floor(Date.now() / 1000),
	});

	logger.info(
		`🌟🌟🌟 Submitted meter event for customer ${customer.id}, feature: ${feature.name}, rounded usage: ${usage}`,
	);
};
