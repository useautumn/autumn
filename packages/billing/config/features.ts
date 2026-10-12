import { feature } from "atmn";
import { apiRequestsRateCard } from "./apiRequestsRateCard";

const existingFeatures = [
	// TODO: delete once Free v29 (the only plan still using them) is retired.
	feature({
		name: "Concurrency",
		type: "metered",
		consumable: false,
		featureId: "CONCURRENCY",
		internalId: "fe_3B7VgZ4H2rwYThSZAb81bSrUXUe",
	}),
	feature({
		name: "Credits",
		type: "metered",
		consumable: true,
		featureId: "CREDITS",
		internalId: "fe_3B7VgjS0QPkH1KLaE88AacZmvDJ",
	}),

	// To delete...
	feature({
		name: "PKey",
		type: "boolean",
		consumable: false,
		featureId: "pkey",
		internalId: "fe_2xoHJhVHoTXyaSoOHJKV3pgJBxk",
	}),
	feature({
		name: "Vercel",
		type: "boolean",
		consumable: false,
		featureId: "vercel",
		internalId: "fe_35Tbbr3i7tIAwo1CJdiZoZ6wpJu",
	}),
	feature({
		name: "RevenueCat",
		type: "boolean",
		consumable: false,
		featureId: "revenuecat",
		internalId: "fe_37DSU4afnB5PqWVsOoHl5jF7w97",
	}),

	feature({
		name: "Platform",
		type: "boolean",
		consumable: false,
		featureId: "platform",
		internalId: "fe_30MSe5e8Z9v1wBzcvzSA5LaIflm",
	}),
	feature({
		name: "SSO",
		type: "boolean",
		consumable: false,
		featureId: "sso",
		internalId: "fe_3H8X9i0IOmsmfxeqmazjNrZFRxZ",
	}),

	// To archive later
	feature({
		name: "USD Revenue",
		type: "metered",
		consumable: true,
		featureId: "revenue",
		internalId: "fe_2sMXW5TsPKq57I9kyX5XsKhoRz0",
	}),
	feature({
		name: "Products",
		type: "metered",
		consumable: false,
		featureId: "products",
		internalId: "fe_2sMG4JJj71cI04mHZxabc1dSNAq",
	}),
];

const newFeatures = [
	feature({
		internalId: "fe_3Jv4AnhU847ELFmrZlrmjXec8kN",
		name: "USD Payment Volume",
		type: "metered",
		consumable: true,
		featureId: "usd_volume",
	}),
	feature({
		internalId: "fe_3JvHuOoBWx7OM0TOShC6pamfqty",
		name: "API Call",
		type: "metered",
		consumable: true,
		featureId: "api_call",
	}),
	feature({
		internalId: "fe_3Jv4Anz2FEE79GsulJIOVJeWWGn",
		name: "API Requests",
		type: "credit_system",
		featureId: "api_requests",
		creditSchema: apiRequestsRateCard,
	}),
	feature({
		internalId: "fe_3Jv4AlLfQne22iCPM04Nicj7j0U",
		name: "Customers & Entities",
		type: "metered",
		consumable: false,
		featureId: "customers_and_entities",
	}),
	feature({
		internalId: "fe_3KaxMMAN6YEXTgJ7wR5bg4NINZk",
		name: "Atoms",
		type: "metered",
		consumable: false,
		featureId: "atoms",
	}),
];

export const features = [...existingFeatures, ...newFeatures];
