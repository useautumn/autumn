import {
	AffectedResource,
	type ApiEntityV2,
	ApiVersion,
	applyResponseVersionChanges,
	type CursorPaginatedResponse,
	type CusProductStatus,
	type EntityLegacyData,
	ErrCode,
	type ListEntitiesParams,
	ListEntitiesParamsSchema,
	ListEntitiesV2_3ParamsSchema,
	type PagePaginatedResponse,
	PaginationType,
	RecaseError,
	Scopes,
	StandardCursor,
	type SubjectQueryRow,
} from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import type { Context } from "hono";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv, RequestContext } from "@/honoUtils/HonoEnv.js";
import { triggerBatchResetSubjectEntitlements } from "@/internal/customers/actions/resetCustomerEntitlementsV2/triggerBatchResetSubjectEntitlements.js";
import {
	ACTIVE_STATUSES,
	RELEVANT_STATUSES,
} from "@/internal/customers/cusProducts/CusProductService.js";
import { resultToFullSubject } from "@/internal/customers/repos/getFullSubject/index.js";
import { getOrgPaginationMaxLimit } from "../../misc/edgeConfig/orgLimitsStore.js";
import { getApiEntityBaseV2 } from "../entityUtils/getApiEntityV2/getApiEntityBaseV2.js";
import { getCursorPaginatedEntitySubjectsQuery } from "../repos/cursorListEntitiesQuery.js";
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
	if (subscriptionStatus === "active") return ACTIVE_STATUSES;
	if (subscriptionStatus) return [subscriptionStatus as CusProductStatus];
	return RELEVANT_STATUSES;
};

const buildApiEntitiesFromRows = async ({
	ctx,
	rows,
}: {
	ctx: RequestContext;
	rows: unknown[];
}) => {
	const fullSubjects = rows.map((row) =>
		resultToFullSubject({
			row: row as unknown as SubjectQueryRow,
			entityIdRequested: true,
		}),
	);

	const entities: ApiEntityV2[] = [];
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

	return entities;
};

const runOffsetListEntities = async ({
	c,
	body,
}: {
	c: Context<HonoEnv>;
	body: ListEntitiesParams;
}) => {
	const ctx = c.get("ctx");
	const inStatuses = getListEntitiesStatuses({
		subscriptionStatus: body.subscription_status,
	});
	const hasFilteredQuery = hasEntityListFilters({
		plans: body.plans,
		processors: body.processors,
		search: body.search,
		customerId: body.customer_id,
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
					customerId: body.customer_id,
				},
				inStatuses,
			})
		: totalCount;

	const entities = await buildApiEntitiesFromRows({ ctx, rows: subjectRows });

	const hasMore = body.offset + entities.length < totalFilteredCount;

	return c.json<
		PagePaginatedResponse<ApiEntityV2> & {
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
};

export const handleListEntitiesV2 = createRoute({
	scopes: [Scopes.Customers.Read],
	versionedBody: {
		latest: ListEntitiesV2_3ParamsSchema,
		[ApiVersion.V2_2]: ListEntitiesParamsSchema,
	},
	versionedHandler: {
		latest: async (c) => {
			const ctx = c.get("ctx");
			const body = c.req.valid("json");

			const maxLimit = getOrgPaginationMaxLimit({
				orgId: ctx.org.id,
				orgSlug: ctx.org.slug,
				type: PaginationType.ListEntities,
			});
			if (body.limit > maxLimit) {
				throw new RecaseError({
					message: `limit ${body.limit} exceeds max of ${maxLimit} for this org`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			const cursor = StandardCursor.decode(body.start_cursor);
			const inStatuses = getListEntitiesStatuses({
				subscriptionStatus: body.subscription_status,
			});

			const rows = await ctx.db.execute(
				getCursorPaginatedEntitySubjectsQuery({
					orgId: ctx.org.id,
					env: ctx.env,
					limit: body.limit,
					cursor,
					inStatuses,
					plans: body.plans,
					processors: body.processors,
					search: body.search,
					customerId: body.customer_id,
				}),
			);

			const hasMore = rows.length > body.limit;
			const pageRows = hasMore ? rows.slice(0, body.limit) : rows;

			const entities = await buildApiEntitiesFromRows({ ctx, rows: pageRows });

			const lastRow = pageRows[pageRows.length - 1] as
				| { entity?: { id?: string; created_at?: number | string } }
				| undefined;
			const lastEntity = lastRow?.entity;
			const nextCursor =
				hasMore && lastEntity?.id && lastEntity.created_at != null
					? StandardCursor.encode({
							id: lastEntity.id,
							t: Number(lastEntity.created_at),
						})
					: null;

			return c.json<CursorPaginatedResponse<ApiEntityV2>>({
				list: entities,
				next_cursor: nextCursor,
			});
		},
		[ApiVersion.V2_2]: async (c) =>
			runOffsetListEntities({ c, body: c.req.valid("json") }),
	},
	resource: AffectedResource.Entity,
});
