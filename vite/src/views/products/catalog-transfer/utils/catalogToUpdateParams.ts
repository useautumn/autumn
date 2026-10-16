import {
	type GetCatalogResponse,
	UpdateCatalogFeatureParamsSchema,
	type UpdateCatalogParamsInput,
	UpdateCatalogPlanParamsSchema,
	UpdateCatalogReferralProgramParamsSchema,
	UpdateCatalogRewardParamsSchema,
} from "@autumn/shared";
import type { z } from "zod/v4";
import type { CatalogExportSections } from "../types/catalogExportSections";
import { projectOntoSchema } from "./projectOntoSchema";

/** Stripe ids, processor mappings and row ids all name the source org's records. */
const SOURCE_ORG_KEYS: ReadonlySet<string> = new Set([
	"processors",
	"internal_id",
	"entitlement_id",
	"price_id",
	"stripe_price_id",
	"stripe_product_id",
]);

const projectRows = ({
	schema,
	rows,
}: {
	schema: z.ZodType;
	rows: Record<string, unknown>[];
}) =>
	rows.map((row) =>
		projectOntoSchema({ schema, value: row, omitKeys: SOURCE_ORG_KEYS }),
	);

/** `version` is the deprecated twin of `version_slug`; stating both is rejected. */
const planRowToParamsRow = ({
	id,
	version,
	...plan
}: GetCatalogResponse["plans"][number]) => ({
	plan_id: id,
	...(plan.version_slug ? {} : { version }),
	...plan,
});

/** A `catalogV2.get` response as the `catalogV2.update` body that recreates it in another org. */
export const catalogToUpdateParams = ({
	catalog,
	sections,
}: {
	catalog: GetCatalogResponse;
	sections: CatalogExportSections;
}): UpdateCatalogParamsInput => {
	const params: Record<string, unknown> = {};
	if (sections.features)
		params.features = projectRows({
			schema: UpdateCatalogFeatureParamsSchema,
			rows: catalog.features.map(({ id, ...feature }) => ({
				feature_id: id,
				...feature,
			})),
		});
	if (sections.plans)
		params.plans = projectRows({
			schema: UpdateCatalogPlanParamsSchema,
			rows: catalog.plans.map(planRowToParamsRow),
		});
	if (sections.rewards) {
		params.rewards = projectRows({
			schema: UpdateCatalogRewardParamsSchema,
			rows: catalog.rewards,
		});
		params.referral_programs = projectRows({
			schema: UpdateCatalogReferralProgramParamsSchema,
			rows: catalog.referral_programs,
		});
	}
	return params as UpdateCatalogParamsInput;
};
