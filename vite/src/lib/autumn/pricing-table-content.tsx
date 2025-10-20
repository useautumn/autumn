import type { Product } from "autumn-js";

export const getPricingTableContent = (product: Product) => {
	const { scenario, free_trial, properties } = product;
	const { is_one_off, updateable, has_trial } = properties;

	if (has_trial) {
		return {
			buttonText: <p>Start Free Trial</p>,
		};
	}

	switch (scenario) {
		case "scheduled":
			return {
				buttonText: <p>Product Scheduled</p>,
			};

		case "active":
			if (updateable) {
				return {
					buttonText: <p>Update Product</p>,
				};
			}

			return {
				buttonText: <p>Current Product</p>,
			};

		case "new":
			if (is_one_off) {
				return {
					buttonText: <p>Purchase</p>,
				};
			}

			return {
				buttonText: <p>Get started</p>,
			};

		case "renew":
			return {
				buttonText: <p>Renew</p>,
			};

		case "upgrade":
			return {
				buttonText: <p>Upgrade</p>,
			};

		case "downgrade":
			return {
				buttonText: <p>Downgrade</p>,
			};

		case "cancel":
			return {
				buttonText: <p>Cancel Product</p>,
			};

		default:
			return {
				buttonText: <p>Get Started</p>,
			};
	}
};
