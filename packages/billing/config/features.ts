import { feature } from "atmn";
import { apiRequestsRateCard } from "./apiRequestsRateCard";

const existingFeatures = [
	// TODO: delete once Free v29 (the only plan still using them) is retired.
	feature({
		name: "Concurrency",
		type: "metered",
		consumable: false,
		featureId: "CONCURRENCY",
		internalId: "fe_3JvRbRAvqeOIawy4gi2fnVKtji4",
	}),
	feature({
		name: "Credits",
		type: "metered",
		consumable: true,
		featureId: "CREDITS",
		internalId: "fe_3JvRbUW2s0AJDEdcCGY415SCA9P",
	}),

	// To delete...
	feature({
		name: "PKey",
		type: "boolean",
		consumable: false,
		featureId: "pkey",
		internalId: "fe_3JvRbWs0JqLin26xunX7ABZbRdw",
	}),
	feature({
		name: "Vercel",
		type: "boolean",
		consumable: false,
		featureId: "vercel",
		internalId: "fe_3JvRbRNGXKxpujlw8RUo0pv1fSg",
	}),
	feature({
		name: "RevenueCat",
		type: "boolean",
		consumable: false,
		featureId: "revenuecat",
		internalId: "fe_3JvRbULj29dsimIEyOxj21Ukrn5",
	}),

	feature({
		name: "Platform",
		type: "boolean",
		consumable: false,
		featureId: "platform",
		internalId: "fe_3JvRbT222O7OeeBIbUdsmmcDMGX",
	}),
	feature({
		name: "SSO",
		type: "boolean",
		consumable: false,
		featureId: "sso",
		internalId: "fe_3JvRbVXa0MYrlikoEniE48z5J94",
	}),

	// To archive later
	feature({
		name: "USD Revenue",
		type: "metered",
		consumable: true,
		featureId: "revenue",
		internalId: "fe_3JvRbQcIPVzT7RHpHiaYPgukYmf",
	}),
	feature({
		name: "Products",
		type: "metered",
		consumable: false,
		featureId: "products",
		internalId: "fe_3JvRbXFuuBboFixd6JU8PhZKWWB",
	}),
];

const newFeatures = [
	feature({
		internalId: "fe_3JvRbQRwejLqYCdukzNsCYi1W1G",
		name: "USD Payment Volume",
		type: "metered",
		consumable: true,
		featureId: "usd_volume",
	}),
	feature({
		internalId: "fe_3JvRbUudhiwSzDfs3jGM2tOMHKX",
		name: "API Call",
		type: "metered",
		consumable: true,
		featureId: "api_call",
	}),
	feature({
		internalId: "fe_3JvRbTWbwPL8ZIjClaARcyojesE",
		name: "API Requests",
		type: "credit_system",
		featureId: "api_requests",
		creditSchema: apiRequestsRateCard,
	}),
	feature({
		internalId: "fe_3JvRbUrMsWg12ZTTnOkxZBtFDon",
		name: "Customers & Entities",
		type: "metered",
		consumable: false,
		featureId: "customers_and_entities",
	}),
];

export const features = [...existingFeatures, ...newFeatures];
