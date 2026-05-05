import {
	ApiVersionClass,
	AppEnv,
	AuthType,
	LATEST_VERSION,
	type OrgConfig,
} from "@autumn/shared";
import { initDrizzle } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { logger } from "../../../src/external/logtail/logtailUtils.js";
import { generateId } from "../../../src/utils/genUtils.js";
import type { TestContext } from "./createTestContext.js";

export type TaxRegistrationCountry =
	| "AU"
	| "GB"
	| "US"
	| "CA"
	| "DE"
	| "FR"
	| "SA"
	| "RU";

export const createSubOrgTestContext = async ({
	subOrgSlug,
	testSecretKey,
	configOverrides,
	taxRegistrations,
}: {
	subOrgSlug: string;
	testSecretKey: string;
	configOverrides?: Partial<OrgConfig>;
	taxRegistrations?: TaxRegistrationCountry[];
}): Promise<TestContext> => {
	const { db } = initDrizzle();

	// 1. Resolve sub-org.
	let subOrg = await OrgService.getBySlug({ db, slug: subOrgSlug });
	if (!subOrg) {
		throw new Error(
			`Sub-org with slug "${subOrgSlug}" not found. ` +
				`Caller must create the sub-org via POST /platform/organizations first.`,
		);
	}

	// 2. Apply config overrides. OrgService.update replaces the whole
	// `config` jsonb, so we merge in JS first.
	if (configOverrides && Object.keys(configOverrides).length > 0) {
		const existingConfig = (subOrg.config ?? {}) as OrgConfig;
		const mergedConfig: OrgConfig = {
			...existingConfig,
			...configOverrides,
		};

		await OrgService.update({
			db,
			orgId: subOrg.id,
			updates: { config: mergedConfig },
		});

		// Re-fetch with merged config.
		const refetched = await OrgService.getBySlug({ db, slug: subOrgSlug });
		if (!refetched) {
			throw new Error(
				`Sub-org with slug "${subOrgSlug}" disappeared after config update`,
			);
		}
		subOrg = refetched;
	}

	// 3. Stripe client scoped to the sub-org's connect account.
	const subStripeCli = createStripeCli({ org: subOrg, env: AppEnv.Sandbox });

	// 4. Stripe Tax jurisdictions. Stripe requires a head office address
	// on Tax Settings before any tax.registrations.create.
	if (taxRegistrations && taxRegistrations.length > 0) {
		try {
			await subStripeCli.tax.settings.update({
				defaults: {
					tax_behavior: "exclusive",
					tax_code: "txcd_10000000",
				},
				head_office: {
					address: {
						country: "US",
						line1: "1 Test Way",
						city: "San Francisco",
						postal_code: "94103",
						state: "CA",
					},
				},
			});
		} catch (err) {
			const stripeErr = err as {
				message?: string;
				code?: string;
				type?: string;
			};
			logger.warn(
				`Failed to set Stripe Tax head office address on sub-org "${subOrgSlug}": ` +
					`${stripeErr.message ?? "(no message)"} ` +
					`[type=${stripeErr.type ?? "unknown"}, code=${stripeErr.code ?? "unknown"}]. ` +
					`Tax registrations will likely fail.`,
			);
		}

		for (const country of taxRegistrations) {
			try {
				if (country === "AU") {
					await subStripeCli.tax.registrations.create({
						country: "AU",
						country_options: { au: { type: "standard" } },
						active_from: "now",
					});
				} else if (country === "GB") {
					await subStripeCli.tax.registrations.create({
						country: "GB",
						country_options: { gb: { type: "standard" } },
						active_from: "now",
					});
				} else if (country === "US") {
					// CA state sales tax. SaaS often isn't taxable in CA, so $0
					// tax on the resulting invoice is expected.
					await subStripeCli.tax.registrations.create({
						country: "US",
						country_options: {
							us: { state: "CA", type: "state_sales_tax" },
						},
						active_from: "now",
					});
				} else if (country === "CA") {
					await subStripeCli.tax.registrations.create({
						country: "CA",
						country_options: { ca: { type: "simplified" } },
						active_from: "now",
					});
				} else if (country === "DE") {
					await subStripeCli.tax.registrations.create({
						country: "DE",
						country_options: {
							de: {
								type: "standard",
								standard: { place_of_supply_scheme: "standard" },
							},
						},
						active_from: "now",
					});
				} else if (country === "FR") {
					await subStripeCli.tax.registrations.create({
						country: "FR",
						country_options: {
							fr: {
								type: "standard",
								standard: { place_of_supply_scheme: "standard" },
							},
						},
						active_from: "now",
					});
				} else if (country === "SA") {
					await subStripeCli.tax.registrations.create({
						country: "SA",
						country_options: { sa: { type: "simplified" } },
						active_from: "now",
					});
				} else if (country === "RU") {
					await subStripeCli.tax.registrations.create({
						country: "RU",
						country_options: { ru: { type: "simplified" } },
						active_from: "now",
					});
				}
			} catch (err) {
				// Tolerate already-registered (Stripe throws); retried setups
				// shouldn't fail.
				const stripeErr = err as {
					message?: string;
					code?: string;
					type?: string;
				};
				logger.warn(
					`Failed to register Stripe Tax for country "${country}" on sub-org "${subOrgSlug}": ` +
						`${stripeErr.message ?? "(no message)"} ` +
						`[type=${stripeErr.type ?? "unknown"}, code=${stripeErr.code ?? "unknown"}]. ` +
						`This may be expected if the registration already exists.`,
				);
			}
		}
	}

	// 5. Sub-org features.
	const features = await FeatureService.list({
		db,
		orgId: subOrg.id,
		env: AppEnv.Sandbox,
	});

	// 6. TestContext with sub-org rebinding (matches createTestContext shape).
	return {
		org: subOrg,
		env: AppEnv.Sandbox,
		stripeCli: subStripeCli,
		db,
		dbGeneral: db,
		features,
		logger,
		redisV2: resolveRedisV2(),
		orgSecretKey: testSecretKey,
		id: generateId("test"),
		isPublic: false,
		authType: AuthType.Unknown,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		timestamp: Date.now(),
		scopes: [],
		skipCache: false,
		expand: [],
		extraLogs: {},
	} satisfies TestContext;
};
