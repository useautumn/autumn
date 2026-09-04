import { describe, expect, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	PaginationType,
	V2_4_MAX_PAGINATION_LIMIT,
} from "@autumn/shared";
import { getOrgPaginationMaxLimit } from "@/internal/misc/edgeConfig/orgLimitsStore.js";

describe("getOrgPaginationMaxLimit V2.4 default", () => {
	test("caps customers and entities lists at 200 for V2.4", () => {
		const apiVersion = new ApiVersionClass(ApiVersion.V2_4);
		expect(
			getOrgPaginationMaxLimit({
				type: PaginationType.ListCustomers,
				apiVersion,
			}),
		).toBe(V2_4_MAX_PAGINATION_LIMIT);
		expect(
			getOrgPaginationMaxLimit({
				type: PaginationType.ListEntities,
				apiVersion,
			}),
		).toBe(V2_4_MAX_PAGINATION_LIMIT);
	});

	test("leaves V2.3 and other list types unchanged", () => {
		const v23 = new ApiVersionClass(ApiVersion.V2_3);
		expect(
			getOrgPaginationMaxLimit({
				type: PaginationType.ListCustomers,
				apiVersion: v23,
			}),
		).toBe(1000);
		expect(
			getOrgPaginationMaxLimit({
				type: PaginationType.ListEntities,
				apiVersion: v23,
			}),
		).toBe(5000);
		expect(
			getOrgPaginationMaxLimit({
				type: PaginationType.ListInvoices,
				apiVersion: new ApiVersionClass(ApiVersion.V2_4),
			}),
		).toBe(1000);
	});
});
