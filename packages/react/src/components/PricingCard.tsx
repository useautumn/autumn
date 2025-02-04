import { PricingPageProps } from "./models";
import { usePricingPageContext } from "./PricingPageContext";

const styles = {
  card: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    overflow: "hidden",
    borderRadius: "6px",
    border: "1px solid #eee",
    // minWidth: "300px",
    width: "100%",
    maxWidth: "450px",
    height: "100%",
    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    backgroundColor: "#eee",
    padding: "10px",
  },

  header: {
    display: "flex",
    width: "100%",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "16px",
    borderBottom: "1px solid #e5e5e5",
    backgroundColor: "#fafafa",
    padding: "48px",
  },

  titleSection: {
    display: "flex",
    width: "100%",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "8px",
  },
  title: {
    fontSize: "1.2rem",
    fontWeight: 600,
    color: "#111",
  },
  description: {
    fontSize: "18px",
    fontWeight: 500,
    color: "#111",
  },
  content: {
    display: "flex",
    width: "100%",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "24px",
    padding: "48px",
    backgroundColor: "#fff",
  },
  pricing: {
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
  },
  amount: {
    fontSize: "32px",
    fontWeight: 600,
    color: "#111",
  },
  interval: {
    fontSize: "16px",
    fontWeight: 500,
    color: "#666",
    paddingBottom: "4px",
  },
  entitlementsList: {
    display: "flex",
    width: "100%",
    flexDirection: "column" as const,
    gap: "8px",
  },
  entitlementItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "16px",
    color: "#666",
  },
  purchaseButton: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "16px",
    color: "#666",
  },
};

interface PricingCardProps {
  product: any;
  classNames?: PricingPageProps["classNames"];
}

enum EntInterval {
  Month = "month",
  Year = "year",
  Lifetime = "lifetime",
}

enum AllowanceType {
  Unlimited = "unlimited",
  None = "none",
  Fixed = "fixed",
}

enum BillingInterval {
  OneOff = "one_off",
  Month = "month",
  Year = "year",
}

enum BillingType {
  UsageInAdvance = "usage_in_advance",
  UsageBelowThreshold = "usage_below_threshold",
  UsageInArrears = "usage_in_arrears",
}

enum FeatureType {
  Boolean = "boolean",
  Usage = "usage",
}

export const PricingCard = ({ product, classNames = {} }: PricingCardProps) => {
  const { cusProducts, customerId } = usePricingPageContext();
  const fixedPrices = product.fixed_prices;
  const usagePrices = product.usage_prices;
  const entitlements = product.entitlements;

  const fixedPriceFree = !fixedPrices.some(
    (price: any) => price.config.amount !== 0
  );

  const getUsagePriceEntitlement = (usagePrice: any) => {
    const entitlement = entitlements.find(
      (entitlement: any) =>
        entitlement.internal_feature_id === usagePrice.internal_feature_id
    );
    return entitlement;
  };

  const formatEntitlement = (entitlement: any, withInterval = true) => {
    const feature = entitlement.feature;
    const allowanceType = entitlement.allowance_type;
    const allowance = entitlement.allowance;

    if (feature.type == FeatureType.Boolean) {
      return feature.name;
    }

    // Feature string
    let featureString = feature.name;
    if (entitlement.allowance_type == AllowanceType.Unlimited) {
      featureString = `Unlimited ${feature.name}`;
    } else if (entitlement.allowance_type == AllowanceType.Fixed) {
      featureString = `${entitlement.allowance} ${feature.name}`;
    } else if (entitlement.allowance_type == AllowanceType.None) {
      featureString = `${feature.name}`;
    }

    // Time string

    const interval = entitlement.interval;
    let timeString = "";
    if (interval == EntInterval.Lifetime) {
      timeString = "(Lifetime)";
    } else {
      timeString = ` / ${interval}`;
    }

    if (withInterval) {
      return `${featureString}${timeString}`;
    } else {
      return `${featureString}`;
    }
  };

  const formatSingleUsagePrice = (usagePrice: any) => {
    const entitlement = getUsagePriceEntitlement(usagePrice);
    const feature = entitlement.feature;
    const usageTiers = usagePrice.config.usage_tiers;

    let priceString = "";
    if (usageTiers.length > 1) {
      priceString = `From ${usageTiers[0].amount}`;
    } else {
      priceString = `${usageTiers[0].amount}`;
    }

    const featureString = formatEntitlement(entitlement, false);

    if (usagePrice.billing_type === BillingType.UsageInAdvance) {
      const billingInterval = usagePrice.config.interval;

      if (billingInterval == BillingInterval.OneOff) {
        return `${priceString} / ${featureString}`;
      } else {
        return `${priceString} / ${featureString} / ${billingInterval}`;
      }
    }

    // 2. Billing type is below threshold
    if (usagePrice.billing_type === BillingType.UsageBelowThreshold) {
      return `${priceString} / ${featureString}`;
    }

    // 3. Billing type is usage in arrears
    if (usagePrice.billing_type === BillingType.UsageInArrears) {
      return `${priceString} / ${featureString}`;
    }

    return "Free";
  };

  const getMainPrice = () => {
    for (const price of fixedPrices) {
      if (price.config.amount !== 0) {
        return `${price.config.amount} / ${price.config.interval}`;
      }
    }

    // If multiple usage price:
    if (usagePrices.length > 1) {
      return `Varies`;
    }

    if (usagePrices.length === 1) {
      return formatSingleUsagePrice(usagePrices[0]);
    }

    return "Free";
  };

  // 1. Get remaining entitlements
  const getRemainingEntitlementsSorted = () => {
    let remainingEntitlements = [...entitlements];

    if (fixedPriceFree && usagePrices.length > 0) {
      // Filter entitlement in first usage price
      remainingEntitlements = remainingEntitlements.filter(
        (e) => e.internal_feature_id !== usagePrices[0].internal_feature_id
      );
    }

    // Sort remaining entitlements
    remainingEntitlements.sort((a, b) => {
      // 1. Check if usage price exists
      const aUsagePrice = usagePrices.find(
        (price: any) => price.internal_feature_id === a.internal_feature_id
      );
      const bUsagePrice = usagePrices.find(
        (price: any) => price.internal_feature_id === b.internal_feature_id
      );

      if (aUsagePrice && !bUsagePrice) {
        return -1;
      }

      if (!aUsagePrice && bUsagePrice) {
        return 1;
      }

      return a.feature.name.localeCompare(b.feature.name);
    });

    return remainingEntitlements;
  };

  const renderEntitlements = () => {
    const remainingEntitlements = getRemainingEntitlementsSorted();

    if (remainingEntitlements.length === 0) {
      return <div>No entitlements</div>;
    }

    return remainingEntitlements.map((ent: any, index: number) => {
      const featureString = formatEntitlement(ent, false);

      return <div key={index}>- {featureString}</div>;
    });
  };

  // Purchase Button

  const isCurrentPlan = () => {
    if (!cusProducts) {
      return false;
    }

    const mainProducts = cusProducts.main;

    return mainProducts.some(
      (mainProduct: any) => mainProduct.id === product.id
    );
  };

  const renderButtonText = () => {
    if (!cusProducts) {
      return "Get Started";
    }

    if (isCurrentPlan()) {
      return "Current Plan";
    }

    return "Get Started";
  };

  const handleButtonClicked = () => {
    if (isCurrentPlan()) {
      return;
    }

    console.log("Button clicked");
  };

  return (
    <div style={styles.card} className={classNames.card}>
      <div style={styles.header} className={classNames.header}>
        <div style={styles.titleSection} className={classNames.titleSection}>
          <div style={styles.title} className={classNames.title}>
            {product.name}
          </div>

          <div>{getMainPrice()}</div>
          <button
            style={{
              backgroundColor: "#000",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: "5px",
            }}
          >
            {renderButtonText()}
          </button>
        </div>
      </div>

      {renderEntitlements()}

      {/* Show usage prices with entitlements first */}

      {/* <div style={styles.content} className={classNames.content}>
        {firstFixedPrice && (
          <div style={styles.pricing} className={classNames.pricing}>
            <span style={styles.amount} className={classNames.amount}>
              ${firstFixedPrice.config.amount}
            </span>
            <div style={styles.interval} className={classNames.interval}>
              per {firstFixedPrice.config.interval}
            </div>
          </div>
        )}

        <div
          style={styles.entitlementsList}
          className={classNames.entitlementsList}
        >
          {entitlements.map((entitlement: any, index: number) => (
            <div
              key={index}
              style={styles.entitlementItem}
              className={classNames.entitlementItem}
            >
              <span>✓</span>
              <span>{entitlement.feature.name}</span>
            </div>
          ))}
        </div>
      </div> */}
    </div>
  );
};
