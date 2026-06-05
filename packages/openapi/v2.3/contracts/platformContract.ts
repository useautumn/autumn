import {
	GetRevenueCatKeysResponseSchema,
	GetRevenueCatKeysSchema,
	LinkRevenueCatResponseSchema,
	LinkRevenueCatSchema,
	SyncRevenueCatResponseSchema,
	SyncRevenueCatSchema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";

export const platformLinkRevenueCatContract = oc
	.route({
		method: "POST",
		path: "/v1/platform.link_revenuecat",
		operationId: "linkRevenueCat",
		tags: ["platform"],
		description:
			"Generate a RevenueCat OAuth URL for linking a project to an organization.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "linkRevenueCat",
		}),
	})
	.input(
		LinkRevenueCatSchema.meta({
			title: "LinkRevenueCatParams",
			examples: [
				{
					organization_slug: "acme",
					env: "test",
					project_name: "acme-mobile",
					redirect_url: "https://dashboard.useautumn.com/dev?tab=revenuecat",
				},
			],
		}),
	)
	.output(
		LinkRevenueCatResponseSchema.meta({
			title: "LinkRevenueCatResponse",
			examples: [
				{
					oauth_url:
						"https://api.revenuecat.com/oauth2/authorize?client_id=...&redirect_uri=...&response_type=code&scope=project.read+project.write",
				},
			],
		}),
	);

export const platformSyncRevenueCatContract = oc
	.route({
		method: "POST",
		path: "/v1/platform.sync_revenuecat",
		operationId: "syncRevenueCat",
		tags: ["platform"],
		description:
			"Push an organization's plans into RevenueCat as products (creating or renaming them across the project's apps) and set test-store prices from each plan's price. Requires the org to have linked RevenueCat via OAuth.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "syncRevenueCat",
		}),
	})
	.input(
		SyncRevenueCatSchema.meta({
			title: "SyncRevenueCatParams",
			examples: [
				{
					organization_slug: "acme",
					env: "test",
					product_ids: ["pro", "premium"],
				},
			],
		}),
	)
	.output(
		SyncRevenueCatResponseSchema.meta({
			title: "SyncRevenueCatResponse",
			examples: [
				{
					results: [
						{
							plan_id: "pro",
							status: "synced",
							store_identifier: "autumn.sandbox.org_123.pro",
							apps: [
								{
									app_id: "app_test",
									app_type: "test_store",
									product: "created",
									store_push: "skipped",
									price: "set",
								},
							],
						},
					],
				},
			],
		}),
	);

export const platformGetRevenueCatKeysContract = oc
	.route({
		method: "POST",
		path: "/v1/platform.get_revenuecat_keys",
		operationId: "getRevenueCatKeys",
		tags: ["platform"],
		description:
			"Retrieve a managed organization's RevenueCat public (SDK) API keys, grouped by app — for the test store, App Store, and Google Play Store. Use these to configure the RevenueCat SDK in the org's mobile app.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "getRevenueCatKeys",
		}),
	})
	.input(
		GetRevenueCatKeysSchema.meta({
			title: "GetRevenueCatKeysParams",
			examples: [{ organization_slug: "acme", env: "test" }],
		}),
	)
	.output(
		GetRevenueCatKeysResponseSchema.meta({
			title: "GetRevenueCatKeysResponse",
			examples: [
				{
					apps: [
						{
							app_id: "app1a2b3c4d",
							app_type: "test_store",
							name: "Acme (Test Store)",
							api_keys: [
								{
									id: "apikey12345",
									key: "test_aBcDeFgHiJkLmNoPqRsTuVwXyZ",
									environment: "production",
									app_id: "app1a2b3c4",
								},
							],
						},
					],
					oauth_access_token: "atk_aBcDeFgHiJkLmNoPqRsTuVwXyZ",
				},
			],
		}),
	);
