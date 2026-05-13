import {
	AffectedResource,
	type ApiCustomerV5,
	applyResponseVersionChanges,
	type CusProductStatus,
	CustomerExpand,
	type CustomerLegacyData,
	type FullCustomer,
	type ListCustomersV2_3Params,
	type ListCustomersV2Params,
	RELEVANT_STATUSES,
	StandardCursor,
	type StandardCursorFields,
} from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import type { AutumnContext, RequestContext } from "@/honoUtils/HonoEnv.js";
import { getOrgCusProductLimit } from "../misc/edgeConfig/orgLimitsStore.js";
import { triggerBatchResetCustomerEntitlements } from "./actions/resetCustomerEntitlements/triggerBatchResetCustomerEntitlements.js";
import { getCursorPaginatedFullCusQuery } from "./cursorPaginatedFullCusQuery.js";
import { CusSearchService } from "./CusSearchService.js";
import { getApiCustomerBase } from "./cusUtils/apiCusUtils/getApiCustomerBase.js";
import { getPaginatedFullCusQuery } from "./getFullCusQuery.js";
import {
	type FlattenedCustomerRow,
	reassembleFlattenedCustomer,
} from "./reassembleFlattenedCustomer/index.js";

export class CusBatchService {
	static async getByInternalIds({
		ctx,
		internalCustomerIds,
	}: {
		ctx: AutumnContext;
		internalCustomerIds: string[];
	}) {
		const { org, env, db } = ctx;
		const cusProductLimit = getOrgCusProductLimit({
			orgId: ctx.org.id,
			orgSlug: ctx.org.slug,
		});

		const query = getPaginatedFullCusQuery({
			orgId: ctx.org.id,
			env: ctx.env,
			includeInvoices: true,
			withEntities: true,
			withTrialsUsed: false,
			withSubs: true,
			limit: internalCustomerIds.length || 100,
			offset: 0,
			internalCustomerIds,
			cusProductLimit,
		});
		const results = await db.execute(query);
		const fullCustomers = results as unknown as FullCustomer[];

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

		const { limit, offset, plans, subscription_status, search, processors } = query;

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
		const results = await ctx.db.execute(sqlQuery);
		const finals = [];
		const fullCustomers: FullCustomer[] = [];

		for (const result of results) {
			try {
				const normalizedCustomer =
					CusBatchService.normalizeCustomerData(result);
				const fullCus = normalizedCustomer as FullCustomer;
				fullCustomers.push(fullCus);

				// Since we already have fullCus from DB, call getApiCustomerBase directly
				const { apiCustomer: baseCustomer, legacyData } =
					await getApiCustomerBase({
						ctx,
						fullCus,
						withAutumnId: false,
					});

				// Apply version changes
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
		const { limit, plans, subscription_status, search, processors } = query;

		const cursor: StandardCursorFields | null = StandardCursor.decode(
			query.cursor,
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
			cusProductLimit,
		});

		const results = await ctx.db.execute(sqlQuery);
		const flat = (results[0] ?? {
			customers: [],
			customer_products: [],
			customer_entitlements: [],
			extra_customer_entitlements: [],
			customer_prices: [],
			entitlements: [],
			rollovers: [],
			replaceables: [],
			free_trials: [],
			subscriptions: [],
		}) as unknown as FlattenedCustomerRow;

		const allCustomers = reassembleFlattenedCustomer(flat);
		const hasMore = allCustomers.length > limit;
		const fullCustomers = hasMore ? allCustomers.slice(0, limit) : allCustomers;
		const peekCustomer = hasMore ? allCustomers[limit] : undefined;

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

		const nextCursor =
			hasMore && peekCustomer && peekCustomer.id
				? StandardCursor.encode({
						id: peekCustomer.id,
						t: peekCustomer.created_at,
					})
				: null;

		return { list: finals, next_cursor: nextCursor };
	}

	static async getDashboardCursorPage({
		ctx,
		search,
		filters,
		cursor,
		limit,
	}: {
		ctx: RequestContext;
		search: string;
		filters?: {
			status?: string[];
			version?: string[];
			none?: boolean;
			processor?: string[];
		};
		cursor: { t: number; id: string } | null;
		limit: number;
	}): Promise<{
		fullCustomers: FullCustomer[];
		next_cursor: string | null;
	}> {
		const { db } = ctx;
		const cusProductLimit = getOrgCusProductLimit({
			orgId: ctx.org.id,
			orgSlug: ctx.org.slug,
		});

		const { internalIds, peek } =
			await CusSearchService.resolveInternalIdsByCursor({
				db,
				orgId: ctx.org.id,
				env: ctx.env,
				search,
				filters,
				cursor,
				limit,
			});

		if (internalIds.length === 0) {
			return { fullCustomers: [], next_cursor: null };
		}

		const query = getCursorPaginatedFullCusQuery({
			orgId: ctx.org.id,
			env: ctx.env,
			inStatuses: RELEVANT_STATUSES,
			withSubs: true,
			limit: internalIds.length,
			internalCustomerIds: internalIds,
			cusProductLimit,
		});
		const rows = (await db.execute(query)) as unknown as Record<
			string,
			unknown
		>[];
		const flat = (rows[0] ?? {
			customers: [],
			customer_products: [],
			customer_entitlements: [],
			extra_customer_entitlements: [],
			customer_prices: [],
			entitlements: [],
			rollovers: [],
			replaceables: [],
			free_trials: [],
			subscriptions: [],
		}) as unknown as FlattenedCustomerRow;

		const fullCustomers = reassembleFlattenedCustomer(flat);

		triggerBatchResetCustomerEntitlements({ ctx, fullCustomers }).catch((err) => {
			ctx.logger.error(
				"[CusBatchService.getDashboardCursorPage] batch reset failed:",
				err,
			);
			Sentry.captureException(err);
		});

		const next_cursor = peek ? StandardCursor.encode(peek) : null;

		return { fullCustomers, next_cursor };
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
