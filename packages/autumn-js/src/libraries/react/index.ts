// Import CSS for tsup injectStyle
import "../../styles/global.css";

// export type { PricingTableProduct } from "@sdk/components/componentTypes";
export type {
	ProductDetails,
	ProductWithDisplay,
} from "./client/ProductDetails";
// Auto-synced components
// export { default as CheckoutDialog } from "./components/checkout-dialog/checkout-dialog-synced";
// export { default as PaywallDialog } from "./components/paywall-dialog/paywall-dialog-synced";
// export { default as PricingTable } from "./components/pricing-table/pricing-table-synced";
// export { useAnalytics } from "./hooks/useAnalytics";
export { useAutumn } from "./hooks/useAutumn";
export { useCustomer } from "./hooks/useCustomer";
export { useEntity } from "./hooks/useEntity";
// export { usePaywall } from "./hooks/usePaywall";
// export { usePricingTable } from "./hooks/usePricingTable";
export { ReactAutumnProvider as AutumnProvider } from "./ReactAutumnProvider";
