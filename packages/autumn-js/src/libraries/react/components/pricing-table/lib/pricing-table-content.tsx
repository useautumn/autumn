import type { ProductWithDisplay } from "../../../index";

export const getPricingTableContent = (product: ProductWithDisplay) => {
	const { scenario, properties } = product;
	const {
		is_one_off = false,
		updateable = false,
		has_trial = false,
	} = properties || {};

	if (has_trial) {
		return {
			buttonText: <p>Start Free Trial</p>,
		};
	}

	switch (scenario) {
		case "scheduled":
			return {
				buttonText: <p>Plan Scheduled</p>,
			};

		case "active":
			if (updateable) {
				return {
					buttonText: <p>Update Plan</p>,
				};
			}

			return {
				buttonText: <p>Current Plan</p>,
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
				buttonText: <p>Cancel Plan</p>,
			};

		default:
			return {
				buttonText: <p>Get Started</p>,
			};
	}
};
