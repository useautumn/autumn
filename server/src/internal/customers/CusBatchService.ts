import {
	AffectedResource,
	type ApiCustomerV5,
	applyResponseVersionChanges,
	BasePriceCursor,
	type CusProductStatus,
	CustomerExpand,
	type CustomerLegacyData,
	type CustomerListFilters,
	type CustomerListSortBy,
	type FullCustomer,
	type ListCustomersV2_3Params,
	type ListCustomersV2Params,
	RELEVANT_STATUSES,
	type SortOrder,
	StandardCursor,
	type StandardCursorFields,
} from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import type { AutumnContext, RequestContext } from "@/honoUtils/HonoEnv.js";
import {
	getOrgCusProductLimit,
	getOrgEntitiesLimit,
} from "../misc/edgeConfig/orgLimitsStore.js";
import { triggerBatchResetCustomerEntitlements } from "./actions/resetCustomerEntitlements/triggerBatchResetCustomerEntitlements.js";
import { CusSearchService } from "./CusSearchService.js";
import { getCursorPaginatedFullCusQuery } from "./cursorPaginatedFullCusQuery.js";
import { getApiCustomerBase } from "./cusUtils/apiCusUtils/getApiCustomerBase.js";
import {
	getPaginatedFullCusQuery,
	parseDashboardIntervalFilter,
	parseDashboardProcessorFilter,
	parseDashboardStatusFilter,
	parseDashboardVersionFilter,
} from "./getFullCusQuery.js";
import {
	type FlattenedCustomerRow,
	reassembleFlattenedCustomer,
} from "./reassembleFlattenedCustomer/index.js";
import { resolveInternalIdsByBasePriceSort } from "./resolveByBasePriceSort.js";

const DASHBOARD_LIST_PRODUCT_PREVIEW_LIMIT = 3;

export class CusBatchService {
	static async getByInternalIds({
		ctx,
		internalCustomerIds,
	}: {
		ctx: AutumnContext;
		internalCustomerIds: string[];
	}): Promise<FullCustomer[]> {
		if (internalCustomerIds.length === 0) return [];

		const query = getCursorPaginatedFullCusQuery({
			orgId: ctx.org.id,
			env: ctx.env,
			withSubs: true,
			withEntities: true,
			entitiesLimit: getOrgEntitiesLimit({
				orgId: ctx.org.id,
				orgSlug: ctx.org.slug,
			}),
			limit: internalCustomerIds.length,
			internalCustomerIds,
			cusProductLimit: getOrgCusProductLimit({
				orgId: ctx.org.id,
				orgSlug: ctx.org.slug,
			}),
		});
		const results = await ctx.db.execute(query);
		const flat = (results[0] ?? {
			customers: [],
			customer_products: [],
			customer_entitlements: [],
			extra_customer_entitlements: [],
			pooled_customer_entitlements: [],
			customer_prices: [],
			entitlements: [],
			rollovers: [],
			replaceables: [],
			free_trials: [],
			subscriptions: [],
		}) as unknown as FlattenedCustomerRow;
		const fullCustomers = reassembleFlattenedCustomer(flat);

		// Fire-and-forget: queue SQS job for any stale entitlement resets
		triggerBatchResetCustomerEntitlements({
			ctx,
			fullCustomers,
		}).catch((err) => {
			ctx.logger.error(
				`[CusBatchService.getByInternalIds] batch reset failed: ${err}`,
			);
			Sentry.captureException(err);
		});

		return fullCustomers;
	}

	static async getPage({
		ctx,
		query,
	}: {
		ctx: RequestContext;
		query: ListCustomersV2Params;
	}) {
		const expand = ctx.expand || [];
		const includeInvoices = expand.includes(CustomerExpand.Invoices);
		const withEntities = expand.includes(CustomerExpand.Entities);
		const withTrialsUsed = expand.includes(CustomerExpand.TrialsUsed);

		const { limit, offset, plans, subscription_status, search, processors } =
			query;

		const cusProductLimit = getOrgCusProductLimit({
			orgId: ctx.org.id,
			orgSlug: ctx.org.slug,
		});
		const sqlQuery = getPaginatedFullCusQuery({
			orgId: ctx.org.id,
			env: ctx.env,
			inStatuses: subscription_status
				? [subscription_status as unknown as CusProductStatus]
				: RELEVANT_STATUSES,
			includeInvoices,
			withEntities,
			withTrialsUsed,
			withSubs: true,
			limit,
			offset,
			search,
			plans,
			processors,
			cusProductLimit,
		});
		const tSqlStart = performance.now();
		const results = await ctx.db.execute(sqlQuery);
		const tSqlEnd = performance.now();
		const finals = [];
		const fullCustomers: FullCustomer[] = [];

		for (const result of results) {
			try {
				const normalizedCustomer =
					CusBatchService.normalizeCustomerData(result);
				const fullCus = normalizedCustomer as FullCustomer;
				fullCustomers.push(fullCus);

				const { apiCustomer: baseCustomer, legacyData } =
					await getApiCustomerBase({
						ctx,
						fullCus,
						withAutumnId: false,
					});

				const versionedCustomer = applyResponseVersionChanges<
					ApiCustomerV5,
					CustomerLegacyData
				>({
					input: baseCustomer,
					legacyData,
					targetVersion: ctx.apiVersion,
					resource: AffectedResource.Customer,
					ctx,
				});

				finals.push(versionedCustomer);
			} catch (error) {
				ctx.logger.error(`Failed to process customer ${result.id}: ${error}`);
			}
		}
		const tHydrateEnd = performance.now();
		const timings = {
			sqlMs: tSqlEnd - tSqlStart,
			hydrateMs: tHydrateEnd - tSqlEnd,
			totalMs: tHydrateEnd - tSqlStart,
			rows: results.length,
		};
		ctx.logger.info(
			`[CusBatchService.getPage] limit=${limit} offset=${offset} rows=${results.length} sql=${timings.sqlMs.toFixed(0)}ms hydrate=${timings.hydrateMs.toFixed(0)}ms total=${timings.totalMs.toFixed(0)}ms`,
		);

		// Fire-and-forget: queue SQS job for any stale entitlement resets
		triggerBatchResetCustomerEntitlements({
			ctx,
			fullCustomers,
		}).catch((err) => {
			ctx.logger.error("[CusBatchService.getPage] batch reset failed:", err);
			Sentry.captureException(err);
		});

		return finals;
	}

	static async getCursorPage({
		ctx,
		query,
	}: {
		ctx: RequestContext;
		query: ListCustomersV2_3Params;
	}): Promise<{ list: ApiCustomerV5[]; next_cursor: string | null }> {
		const {
			limit,
			plans,
			subscription_status,
			search,
			processors,
			created_at_range,
		} = query;

		const cursor: StandardCursorFields | null = StandardCursor.decode(
			query.start_cursor,
		);

		const cusProductLimit = getOrgCusProductLimit({
			orgId: ctx.org.id,
			orgSlug: ctx.org.slug,
		});

		const sqlQuery = getCursorPaginatedFullCusQuery({
			orgId: ctx.org.id,
			env: ctx.env,
			inStatuses: subscription_status
				? [subscription_status as unknown as CusProductStatus]
				: RELEVANT_STATUSES,
			withSubs: true,
			limit,
			cursor: cursor ?? undefined,
			search,
			plans,
			processors,
			createdAtRangeFilter: created_at_range,
			cusProductLimit,
			sortOrder: query.sort_order,
		});

		const tSqlStart = performance.now();
		const results = await ctx.db.execute(sqlQuery);
		const tSqlEnd = performance.now();
		const flat = (results[0] ?? {
			customers: [],
			customer_products: [],
			customer_entitlements: [],
			extra_customer_entitlements: [],
			pooled_customer_entitlements: [],
			customer_prices: [],
			entitlements: [],
			rollovers: [],
			replaceables: [],
			free_trials: [],
			subscriptions: [],
		}) as unknown as FlattenedCustomerRow;

		const allCustomers = reassembleFlattenedCustomer(flat);
		const tReassembleEnd = performance.now();
		const hasMore = allCustomers.length > limit;
		const fullCustomers = hasMore ? allCustomers.slice(0, limit) : allCustomers;

		const finals: ApiCustomerV5[] = [];

		for (const fullCus of fullCustomers) {
			try {
				const { apiCustomer: baseCustomer, legacyData } =
					await getApiCustomerBase({
						ctx,
						fullCus,
						withAutumnId: false,
					});

				const versionedCustomer = applyResponseVersionChanges<
					ApiCustomerV5,
					CustomerLegacyData
				>({
					input: baseCustomer,
					legacyData,
					targetVersion: ctx.apiVersion,
					resource: AffectedResource.Customer,
					ctx,
				});

				finals.push(versionedCustomer);
			} catch (error) {
				ctx.logger.error(`Failed to process customer ${fullCus.id}: ${error}`);
			}
		}
		const tVersionEnd = performance.now();
		const timings = {
			sqlMs: tSqlEnd - tSqlStart,
			reassembleMs: tReassembleEnd - tSqlEnd,
			versionMs: tVersionEnd - tReassembleEnd,
			totalMs: tVersionEnd - tSqlStart,
			rows: fullCustomers.length,
		};
		ctx.logger.info(
			`[CusBatchService.getCursorPage] limit=${limit} cursor=${cursor ? "yes" : "no"} rows=${fullCustomers.length} sql=${timings.sqlMs.toFixed(0)}ms reassemble=${timings.reassembleMs.toFixed(0)}ms version=${timings.versionMs.toFixed(0)}ms total=${timings.totalMs.toFixed(0)}ms`,
		);

		triggerBatchResetCustomerEntitlements({
			ctx,
			fullCustomers,
		}).catch((err) => {
			ctx.logger.error(
				"[CusBatchService.getCursorPage] batch reset failed:",
				err,
			);
			Sentry.captureException(err);
		});

		const lastCustomer = fullCustomers[fullCustomers.length - 1];
		const nextCursor =
			hasMore && lastCustomer?.id
				? StandardCursor.encode({
						id: lastCustomer.id,
						t: lastCustomer.created_at,
					})
				: null;

		return { list: finals, next_cursor: nextCursor };
	}

	static async getDashboardCursorPage({
		ctx,
		search,
		filters,
		cursor,
		basePriceCursor,
		sortBy = "created_at",
		limit,
		sortOrder,
	}: {
		ctx: RequestContext;
		search: string;
		filters?: CustomerListFilters;
		cursor: { t: number; id: string } | null;
		basePriceCursor?: { p: number; id: string } | null;
		sortBy?: CustomerListSortBy;
		limit: number;
		sortOrder?: SortOrder;
	}): Promise<{
		fullCustomers: FullCustomer[];
		next_cursor: string | null;
	}> {
		const cusProductLimit = DASHBOARD_LIST_PRODUCT_PREVIEW_LIMIT;
		const entitiesLimit = getOrgEntitiesLimit({
			orgId: ctx.org.id,
			orgSlug: ctx.org.slug,
		});

		if (sortBy === "base_price") {
			return await CusBatchService.getBasePriceSortedPage({
				ctx,
				search,
				filters,
				cursor: basePriceCursor ?? null,
				limit,
				sortOrder,
				cusProductLimit,
				entitiesLimit,
			});
		}

		const statusFilters = parseDashboardStatusFilter(filters?.status);

		const productVersionFilters = parseDashboardVersionFilter(filters?.version);

		const intervalFilters = parseDashboardIntervalFilter(filters?.interval);

		// Status/none/version filter on a different table (customer_products) than
		// the cursor (customers). Folding it into the main query forces a merge join
		// that abandons idx_customers_cursor and degrades to seconds.
		const requiresResolveStep =
			statusFilters.length > 0 ||
			productVersionFilters.length > 0 ||
			intervalFilters.length > 0 ||
			!!filters?.none;

		const tResolveStart = performance.now();
		let internalIds: string[] | undefined;
		let resolvedPeek: { t: number; id: string } | null = null;
		if (requiresResolveStep) {
			const resolved = await CusSearchService.resolveInternalIdsByCursor({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				search,
				filters,
				cursor,
				limit,
				sortOrder,
			});
			internalIds = resolved.internalIds;
			resolvedPeek = resolved.peek;
			if (internalIds.length === 0) {
				ctx.logger.info(
					`[CusBatchService.getDashboardCursorPage] limit=${limit} cursor=${cursor ? "yes" : "no"} rows=0 resolve=${(performance.now() - tResolveStart).toFixed(0)}ms sql=0ms reassemble=0ms total=${(performance.now() - tResolveStart).toFixed(0)}ms`,
				);
				return { fullCustomers: [], next_cursor: null };
			}
		}
		const tResolveEnd = performance.now();

		const sqlQuery = getCursorPaginatedFullCusQuery({
			orgId: ctx.org.id,
			env: ctx.env,
			inStatuses: RELEVANT_STATUSES,
			withSubs: true,
			withEntities: true,
			includeInvoices: true,
			// Only the dashboard renders products_page / products_total_count.
			withProductsPage: true,
			entitiesLimit,
			limit: internalIds ? internalIds.length : limit,
			cursor:
				!requiresResolveStep && cursor
					? { v: 0, t: cursor.t, id: cursor.id }
					: undefined,
			internalCustomerIds: internalIds,
			search: requiresResolveStep ? undefined : search,
			processors: requiresResolveStep
				? undefined
				: parseDashboardProcessorFilter(filters?.processor),
			createdAtRangeFilter: requiresResolveStep
				? undefined
				: filters?.created_at_range,
			cusProductLimit,
			sortOrder,
		});

		const tSqlStart = performance.now();
		const rows = (await ctx.db.execute(sqlQuery)) as unknown as Record<
			string,
			unknown
		>[];
		const tSqlEnd = performance.now();
		const flat = (rows[0] ?? {
			customers: [],
			customer_products: [],
			customer_entitlements: [],
			extra_customer_entitlements: [],
			pooled_customer_entitlements: [],
			customer_prices: [],
			entitlements: [],
			rollovers: [],
			replaceables: [],
			free_trials: [],
			subscriptions: [],
			entities: [],
			invoices: [],
		}) as unknown as FlattenedCustomerRow;

		const allCustomers = reassembleFlattenedCustomer(flat);
		const tReassembleEnd = performance.now();

		let fullCustomers: FullCustomer[];
		let hasMore: boolean;
		if (requiresResolveStep) {
			fullCustomers = allCustomers;
			hasMore = resolvedPeek !== null;
		} else {
			hasMore = allCustomers.length > limit;
			fullCustomers = hasMore ? allCustomers.slice(0, limit) : allCustomers;
		}
		const lastCustomer = fullCustomers[fullCustomers.length - 1];
		const nextCursor =
			hasMore && lastCustomer?.id
				? StandardCursor.encode({
						id: lastCustomer.id,
						t: lastCustomer.created_at,
					})
				: null;

		ctx.logger.info(
			`[CusBatchService.getDashboardCursorPage] limit=${limit} cursor=${cursor ? "yes" : "no"} rows=${fullCustomers.length} resolve=${(tResolveEnd - tResolveStart).toFixed(0)}ms sql=${(tSqlEnd - tSqlStart).toFixed(0)}ms reassemble=${(tReassembleEnd - tSqlEnd).toFixed(0)}ms total=${(tReassembleEnd - tResolveStart).toFixed(0)}ms`,
		);

		triggerBatchResetCustomerEntitlements({ ctx, fullCustomers }).catch(
			(err) => {
				ctx.logger.error(
					"[CusBatchService.getDashboardCursorPage] batch reset failed:",
					err,
				);
				Sentry.captureException(err);
			},
		);

		return { fullCustomers, next_cursor: nextCursor };
	}

	/** Base-price sort page: resolve ids ordered by monthly base-price total,
	 * hydrate via the id-list path, then restore the resolver's order (the
	 * hydration query internally orders by created_at). */
	private static async getBasePriceSortedPage({
		ctx,
		search,
		filters,
		cursor,
		limit,
		sortOrder,
		cusProductLimit,
		entitiesLimit,
	}: {
		ctx: RequestContext;
		search: string;
		filters?: CustomerListFilters;
		cursor: { p: number; id: string } | null;
		limit: number;
		sortOrder?: SortOrder;
		cusProductLimit: number;
		entitiesLimit: number;
	}): Promise<{
		fullCustomers: FullCustomer[];
		next_cursor: string | null;
	}> {
		const tResolveStart = performance.now();
		const { rows, hasMore } = await resolveInternalIdsByBasePriceSort({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			search,
			filters,
			cursor,
			limit,
			sortOrder,
		});
		const tResolveEnd = performance.now();

		if (rows.length === 0) {
			ctx.logger.info(
				`[CusBatchService.getBasePriceSortedPage] limit=${limit} cursor=${cursor ? "yes" : "no"} rows=0 resolve=${(tResolveEnd - tResolveStart).toFixed(0)}ms`,
			);
			return { fullCustomers: [], next_cursor: null };
		}

		const internalIds = rows.map((row) => row.internalId);
		const sqlQuery = getCursorPaginatedFullCusQuery({
			orgId: ctx.org.id,
			env: ctx.env,
			inStatuses: RELEVANT_STATUSES,
			withSubs: true,
			withEntities: true,
			includeInvoices: true,
			withProductsPage: true,
			entitiesLimit,
			limit: internalIds.length,
			internalCustomerIds: internalIds,
			cusProductLimit,
		});

		const tSqlStart = performance.now();
		const sqlRows = (await ctx.db.execute(sqlQuery)) as unknown as Record<
			string,
			unknown
		>[];
		const tSqlEnd = performance.now();
		const flat = (sqlRows[0] ?? {
			customers: [],
			customer_products: [],
			customer_entitlements: [],
			extra_customer_entitlements: [],
			pooled_customer_entitlements: [],
			customer_prices: [],
			entitlements: [],
			rollovers: [],
			replaceables: [],
			free_trials: [],
			subscriptions: [],
			entities: [],
			invoices: [],
		}) as unknown as FlattenedCustomerRow;

		const fullCustomers = reassembleFlattenedCustomer(flat);
		const orderIndex = new Map(internalIds.map((id, index) => [id, index]));
		fullCustomers.sort(
			(a, b) =>
				(orderIndex.get(a.internal_id) ?? Number.MAX_SAFE_INTEGER) -
				(orderIndex.get(b.internal_id) ?? Number.MAX_SAFE_INTEGER),
		);

		ctx.logger.info(
			`[CusBatchService.getBasePriceSortedPage] limit=${limit} cursor=${cursor ? "yes" : "no"} rows=${fullCustomers.length} resolve=${(tResolveEnd - tResolveStart).toFixed(0)}ms sql=${(tSqlEnd - tSqlStart).toFixed(0)}ms total=${(tSqlEnd - tResolveStart).toFixed(0)}ms`,
		);

		triggerBatchResetCustomerEntitlements({ ctx, fullCustomers }).catch(
			(err) => {
				ctx.logger.error(
					"[CusBatchService.getBasePriceSortedPage] batch reset failed:",
					err,
				);
				Sentry.captureException(err);
			},
		);

		const lastRow = rows[rows.length - 1];
		const nextCursor =
			hasMore && lastRow
				? BasePriceCursor.encode({ id: lastRow.internalId, p: lastRow.total })
				: null;

		return { fullCustomers, next_cursor: nextCursor };
	}

	/**
	 * Normalize customer data by converting string fields to numbers
	 */
	private static normalizeCustomerData(rawCustomer: any): any {
		const normalizeTimestamp = (value: any): number => {
			if (typeof value === "string") {
				const parsed = parseInt(value, 10);
				return Number.isNaN(parsed) ? Date.now() : parsed;
			}
			return typeof value === "number" ? value : Date.now();
		};

		const normalizedCustomer = {
			...rawCustomer,
			created_at: normalizeTimestamp(rawCustomer.created_at),
		};

		// Normalize customer products
		if (
			rawCustomer.customer_products &&
			Array.isArray(rawCustomer.customer_products)
		) {
			normalizedCustomer.customer_products = rawCustomer.customer_products.map(
				(cp: any) => ({
					...cp,
					created_at: normalizeTimestamp(cp.created_at),
					starts_at: cp.starts_at
						? normalizeTimestamp(cp.starts_at)
						: normalizeTimestamp(cp.created_at),
					canceled_at: cp.canceled_at
						? normalizeTimestamp(cp.canceled_at)
						: null,
					ended_at: cp.ended_at ? normalizeTimestamp(cp.ended_at) : null,
					trial_ends_at: cp.trial_ends_at
						? normalizeTimestamp(cp.trial_ends_at)
						: null,
					quantity: cp.quantity ? parseInt(cp.quantity, 10) || 1 : 1,
					options: cp.options || [],
					collection_method: cp.collection_method || "charge_automatically",
					subscription_ids: cp.subscription_ids || [],
					scheduled_ids: cp.scheduled_ids || [],
					// Normalize customer entitlements
					customer_entitlements: (cp.customer_entitlements || []).map(
						(ce: any) => ({
							...ce,
							created_at: normalizeTimestamp(ce.created_at),
							next_reset_at: ce.next_reset_at
								? normalizeTimestamp(ce.next_reset_at)
								: null,
							balance: ce.balance ? parseFloat(ce.balance) || 0 : 0,
							adjustment: ce.adjustment ? parseFloat(ce.adjustment) || 0 : 0,
						}),
					),
				}),
			);
		}

		return normalizedCustomer;
	}
}
