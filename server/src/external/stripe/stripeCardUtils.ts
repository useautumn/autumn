import type { AppEnv, ProcessorConfigs } from "@autumn/shared";
import type { Customer } from "@shared/models/cusModels/cusModels.js";
import type { Organization } from "@shared/models/orgModels/orgTable.js";
import { createStripeCli } from "../connect/createStripeCli.js";

export const isStripeCardDeclined = (error: any) => {
	return (
		error.code === "card_declined" ||
		error.code === "expired_card" ||
		error.code === "incorrect_cvc" ||
		error.code === "processing_error" ||
		error.code === "incorrect_number" ||
		error.code === "subscription_payment_intent_requires_action" ||
		error.code === "payment_intent_payment_attempt_failed" // Stripe link
	);
};

export const createCustomStripeCard = async ({
	org,
	env,
	customer,
	processor = "vercel",
	processorData,
	defaultPaymentMethod = false,
}: {
	org: Organization;
	env: AppEnv;
	customer: Customer;
	processor?: keyof ProcessorConfigs;
	processorData?: {
		name: string;
		email: string;
	};
	defaultPaymentMethod?: boolean;
}) => {
	const stripeCli = createStripeCli({ org, env });
	const customPaymentMethodId =
		org.processor_configs?.[processor]?.custom_payment_method?.[env];
	if (customPaymentMethodId?.trim()) {
		const pm = await stripeCli.paymentMethods.create({
			type: "custom",
			custom: {
				type: customPaymentMethodId.trim(),
			},
			billing_details: {
				name: processorData?.name,
				email: processorData?.email,
			},
		});
		await stripeCli.paymentMethods.attach(pm.id, {
			customer: customer.processor.id,
		});
		if (defaultPaymentMethod) {
			await stripeCli.customers.update(customer.processor.id, {
				invoice_settings: {
					default_payment_method: pm.id,
				},
			});
		}
		return pm;
	} else return null;
};
