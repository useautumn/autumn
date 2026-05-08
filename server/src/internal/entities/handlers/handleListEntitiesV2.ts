import {
	AffectedResource,
	type ApiEntityV2,
	ApiVersion,
	applyResponseVersionChanges,
	type CusProductStatus,
	type EntityLegacyData,
	ListEntitiesParamsSchema,
	type PagePaginatedResponse,
	Scopes,
	type SubjectQueryRow,
} from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { triggerBatchResetSubjectEntitlements } from "@/internal/customers/actions/resetCustomerEntitlementsV2/triggerBatchResetSubjectEntitlements.js";
import {
	ACTIVE_STATUSES,
	RELEVANT_STATUSES,
} from "@/internal/customers/cusProducts/CusProductService.js";
import { resultToFullSubject } from "@/internal/customers/repos/getFullSubject/index.js";
import { getApiEntityBaseV2 } from "../entityUtils/getApiEntityV2/getApiEntityBaseV2.js";
import {
	countEntitiesByOrgIdAndEnv,
	countFilteredEntitiesByOrgIdAndEnv,
	getPaginatedEntitySubjectsQuery,
	hasEntityListFilters,
} from "../repos/listEntitiesQuery.js";

const getListEntitiesStatuses = ({
	subscriptionStatus,
}: {
	subscriptionStatus?: "active" | "scheduled";
}): CusProductStatus[] => {
	if (subscriptionStatus === "active") {
		return ACTIVE_STATUSES;
	}

	if (subscriptionStatus) {
		return [subscriptionStatus as CusProductStatus];
	}

	return RELEVANT_STATUSES;
};

export const handleListEntitiesV2 = createRoute({
	scopes: [Scopes.Customers.Read],
	versionedBody: {
		latest: ListEntitiesParamsSchema,
		[ApiVersion.V2_0]: ListEntitiesParamsSchema,
	},
	resource: AffectedResource.Entity,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const inStatuses = getListEntitiesStatuses({
			subscriptionStatus: body.subscription_status,
		});
		const hasFilteredQuery = hasEntityListFilters({
			plans: body.plans,
			processors: body.processors,
			search: body.search,
		});

		const [subjectRows, totalCount] = await Promise.all([
			ctx.db.execute(
				getPaginatedEntitySubjectsQuery({
					orgId: ctx.org.id,
					env: ctx.env,
					query: body,
					inStatuses,
				}),
			),
			countEntitiesByOrgIdAndEnv({ ctx }),
		]);

		const totalFilteredCount = hasFilteredQuery
			? await countFilteredEntitiesByOrgIdAndEnv({
					ctx,
					query: {
						plans: body.plans,
						processors: body.processors,
						search: body.search,
					},
					inStatuses,
				})
			: totalCount;

		const fullSubjects = subjectRows.map((row) =>
			resultToFullSubject({
				row: row as unknown as SubjectQueryRow,
				entityIdRequested: true,
			}),
		);

		const entities = [];
		for (const fullSubject of fullSubjects) {
			const { apiEntity: baseEntity, legacyData } = await getApiEntityBaseV2({
				ctx,
				fullSubject,
				withAutumnId: false,
			});

			const cleanedEntity: ApiEntityV2 = {
				...baseEntity,
				feature_id: baseEntity.feature_id || undefined,
				autumn_id: undefined,
				invoices: undefined,
			};

			entities.push(
				applyResponseVersionChanges<ApiEntityV2, EntityLegacyData>({
					input: cleanedEntity,
					targetVersion: ctx.apiVersion,
					resource: AffectedResource.Entity,
					legacyData,
					ctx,
				}),
			);
		}

		triggerBatchResetSubjectEntitlements({
			ctx,
			fullSubjects,
		}).catch((err) => {
			ctx.logger.error("[handleListEntitiesV2] batch reset failed:", err);
			Sentry.captureException(err);
		});

		const hasMore = body.offset + entities.length < totalFilteredCount;

		return c.json<
			PagePaginatedResponse<(typeof entities)[number]> & {
				total_count: number;
				total_filtered_count: number;
			}
		>({
			list: entities,
			total: entities.length,
			total_count: totalCount,
			total_filtered_count: totalFilteredCount,
			limit: body.limit,
			offset: body.offset,
			has_more: hasMore,
		});
	},
});
