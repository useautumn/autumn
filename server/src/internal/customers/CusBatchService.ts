import {
	AffectedResource,
	type ApiCustomerV5,
	type AppEnv,
	applyResponseVersionChanges,
	type CusProductStatus,
	CustomerExpand,
	type CustomerLegacyData,
	type FullCustomer,
	type ListCustomersV2Params,
	type Organization,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "./cusUtils/apiCusUtils/getApiCustomerBase.js";
import { getPaginatedFullCusQuery } from "./getFullCusQuery.js";

export class CusBatchService {
	static async getByInternalIds({
		db,
		org,
		env,
		internalCustomerIds,
	}: {
		db: DrizzleCli;
		org: Organization;
		env: AppEnv;
		internalCustomerIds: string[];
	}) {
		const query = getPaginatedFullCusQuery({
			orgId: org.id,
			env,
			includeInvoices: true,
			withEntities: true,
			withTrialsUsed: false,
			withSubs: true,
			limit: internalCustomerIds.length || 100,
			offset: 0,
			internalCustomerIds,
		});
		const results = await db.execute(query);

		return results as unknown as FullCustomer[];
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

		const { limit, offset, plans, subscription_status, search } = query;

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
		});
		const results = await ctx.db.execute(sqlQuery);
		const finals = [];

		for (const result of results) {
			try {
				const normalizedCustomer =
					CusBatchService.normalizeCustomerData(result);
				const fullCus = normalizedCustomer as FullCustomer;

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
				console.error(`Failed to process customer ${result.id}:`, error);
			}
		}

		return finals;
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
