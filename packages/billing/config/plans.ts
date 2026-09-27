import { plan } from "atmn";

const proPlans = [
	plan({
		internalId: "prod_3JvM59Sw8lQrAUJACtMl4Poh9B4",
		planId: "pro",
		name: "Pro",
		active: true,
		price: {
			amount: 375,
			interval: "month",
		},
		items: [
			{
				featureId: "usd_volume",
				included: 50_000,
				reset: {
					interval: "month",
				},
			},
			{
				featureId: "api_requests",
				included: 20_000_000,
				reset: {
					interval: "month",
				},
			},
			{
				featureId: "customers_and_entities",
				unlimited: true,
			},
			{
				featureId: "revenuecat",
			},
			{
				featureId: "vercel",
			},
		],
		billingControls: {
			overageAllowed: [
				{ featureId: "usd_volume", enabled: true },
				{ featureId: "api_requests", enabled: true },
			],
		},
		variants: [
			{
				internalId: "prod_3JvXixoCCtazwrtSMNawoQ2vJ6a",
				variantPlanId: "pro_200k",
				name: "Pro 200K",
				versionSlug: "new-v1",
				customize: {
					price: {
						amount: 995,
						interval: "month",
					},
					items: [
						{
							featureId: "usd_volume",
							included: 200_000,
							reset: {
								interval: "month",
							},
						},
						{
							featureId: "api_requests",
							included: 20_000_000,
							reset: {
								interval: "month",
							},
						},
						{
							featureId: "customers_and_entities",
							unlimited: true,
						},
						{
							featureId: "revenuecat",
						},
						{
							featureId: "vercel",
						},
					],
					billingControls: {
						overageAllowed: [
							{ featureId: "usd_volume", enabled: true },
							{ featureId: "api_requests", enabled: true },
						],
					},
				},
			},
		],
		versionSlug: "new-v2",
	}),
	plan({
		internalId: "prod_3Jv5a45Uh0e4fT9GKwfeTgGTpmA",
		planId: "pro",
		name: "Pro",
		active: false,
		price: {
			amount: 300,
			interval: "month",
		},
		items: [
			{
				featureId: "usd_volume",
				included: 50_000,
				reset: {
					interval: "month",
				},
			},
			{
				featureId: "api_requests",
				included: 20_000_000,
				reset: {
					interval: "month",
				},
			},
			{
				featureId: "customers_and_entities",
				unlimited: true,
			},
			{
				featureId: "revenuecat",
			},
			{
				featureId: "vercel",
			},
		],
		billingControls: {
			overageAllowed: [
				{ featureId: "usd_volume", enabled: true },
				{ featureId: "api_requests", enabled: true },
			],
		},
		versionSlug: "new-v1",
	}),
];

const otherPlans = [
	plan({
		internalId: "prod_3Jv4Ao9YRTdT8JjNe6fuGlE8xg1",
		planId: "free",
		name: "Free",
		autoEnable: true,
		active: true,
		items: [
			{
				featureId: "usd_volume",
				included: 8_000,
				reset: {
					interval: "month",
				},
			},
			{
				featureId: "api_requests",
				included: 10_000_000,
				reset: {
					interval: "month",
				},
			},
			{
				featureId: "customers_and_entities",
				included: 10_000,
			},
		],
		config: {
			anchorToMonthStart: true,
		},
		versionSlug: "new-v1",
	}),
	plan({
		planId: "free",
		internalId: "prod_3B7uLJD2NszYK42kycW9EXELBrV",
		name: "Free",
		autoEnable: false,
		active: false,
		items: [
			{
				featureId: "CONCURRENCY",
				included: 2,
			},
			{
				featureId: "CREDITS",
				included: 500,
				reset: {
					interval: "one_off",
				},
			},
		],
		versionSlug: "v29",
	}),
	plan({
		planId: "growth",
		internalId: "prod_3B7Ww8QLMGx7SfTpnQcSv2uWLXF",
		name: "Growth",
		active: true,
		price: {
			amount: 399,
			interval: "month",
		},
		items: [
			{
				featureId: "products",
				included: 0,
				unlimited: true,
			},
			{
				featureId: "revenue",
				included: 250000,
				reset: {
					interval: "month",
				},
			},
		],
		versionSlug: "v2",
	}),
	plan({
		planId: "growth",
		internalId: "prod_31RyY1WYTjTTEoKVrKDcjFd37FR",
		name: "Growth",
		active: false,
		price: {
			amount: 800,
			interval: "month",
		},
		items: [
			{
				featureId: "products",
				included: 0,
				unlimited: true,
			},
			{
				featureId: "revenue",
				included: 0,
				unlimited: true,
				reset: {
					interval: "month",
				},
			},
		],
		versionSlug: "v1",
	}),
	plan({
		planId: "platform",
		internalId: "prod_343H96pCfCUXVl0ZLDK8TfT8lzj",
		name: "Platform",
		active: true,
		price: {
			amount: 375,
			interval: "month",
		},
		items: [
			{
				featureId: "platform",
			},
		],
		versionSlug: "v1",
	}),
];

export const plans = [...proPlans, ...otherPlans];
