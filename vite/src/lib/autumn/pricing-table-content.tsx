import { type CheckProductPreview } from "autumn-js";

export const getPricingTableContent = (product: any) => {
  const { scenario, free_trial } = product;

  if (free_trial && free_trial.trial_available) {
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
      return {
        buttonText: <p>Current Plan</p>,
      };

    case "new":
      if (product.properties?.is_one_off) {
        return {
          buttonText: <p>Purchase</p>,
        };
      } else {
        return {
          buttonText: <p>Get started</p>,
        };
      }

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
