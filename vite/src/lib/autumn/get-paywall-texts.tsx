import { type CheckFeatureFormattedPreview } from "autumn-js";

export const getPaywallDialogTexts = (
  preview: CheckFeatureFormattedPreview
) => {
  const { scenario, products, feature_name } = preview;

  if (products.length == 0) {
    switch (scenario) {
      case "usage_limit":
        return {
          title: `Feature Unavailable`,
          message: `You have reached the usage limit for ${feature_name}. Please contact us to increase your limit.`,
        };
      default:
        return {
          title: "Feature Unavailable",
          message:
            "This feature is not available for your account. Please contact us to enable it.",
        };
    }
  }

  const nextProduct = products[0];

  const isAddOn = nextProduct && nextProduct.is_add_on;

  const title = nextProduct.free_trial
    ? `Start trial for ${nextProduct.name}`
    : nextProduct.is_add_on
    ? `Purchase ${nextProduct.name}`
    : `Upgrade to ${nextProduct.name}`;

  let message = "";
  if (isAddOn) {
    message = `Please purchase the ${nextProduct.name} add-on to continue using ${feature_name}.`;
  } else {
    message = `Please upgrade to the ${nextProduct.name} plan to continue using ${feature_name}.`;
  }

  switch (scenario) {
    case "usage_limit":
      return {
        title: title,
        message: `You have reached the usage limit for ${feature_name}. ${message}`,
      };
    case "feature_flag":
      return {
        title: title,
        message: `This feature is not available for your account. ${message}`,
      };
    default:
      return {
        title: "Feature Unavailable",
        message: "This feature is not available for your account.",
      };
  }
};
