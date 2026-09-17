import { describe, expect, test } from "bun:test";
import type { z } from "zod/v4";
import { workerCustomerEntitlementSchema } from "../../../../src/models/subject/rows/workerCustomerEntitlement.js";
import { workerCustomerProductSchema } from "../../../../src/models/subject/rows/workerCustomerProduct.js";
import { workerEntitySchema } from "../../../../src/models/subject/rows/workerEntity.js";
import { workerRolloverSchema } from "../../../../src/models/subject/rows/workerRollover.js";

const customerEntitlement = {
	id: "ce_1",
	customer_product_id: "cp_1",
	entitlement_id: "ent_1",
	internal_customer_id: "cus_internal_1",
	internal_entity_id: null,
	internal_feature_id: "feat_internal_1",
	balance: 95,
	adjustment: 0,
	additional_balance: 0,
	unlimited: false,
	usage_allowed: false,
	next_reset_at: 1_800_000_000_000,
	reset_cycle_anchor: null,
	expires_at: null,
	external_id: null,
	created_at: 1_700_000_000_000,
};

const customerProduct = {
	id: "cp_1",
	internal_customer_id: "cus_internal_1",
	internal_product_id: "prod_internal_1",
	internal_entity_id: null,
	status: "active",
	options: [{ feature_id: "seats", quantity: 3 }],
	quantity: 1,
	created_at: 1_700_000_000_000,
	starts_at: 1_700_000_000_000,
	access_starts_at: null,
	ended_at: null,
	customer_license_link_id: null,
};

const rollover = {
	id: "ro_1",
	cus_ent_id: "ce_1",
	balance: 10,
	usage: 0,
	expires_at: 1_800_000_000_000,
};

const entity = {
	id: "site_1",
	internal_id: "ent_internal_1",
	internal_customer_id: "cus_internal_1",
	feature_id: "sites",
};

describe("worker rows", () => {
	test.each([
		[
			"customer entitlement",
			workerCustomerEntitlementSchema,
			customerEntitlement,
		],
		["customer product", workerCustomerProductSchema, customerProduct],
		["rollover", workerRolloverSchema, rollover],
		["entity", workerEntitySchema, entity],
	] as [string, z.ZodType, object][])(
		"%s round-trips through JSON",
		(_name, schema, row) => {
			const parsed = schema.parse(JSON.parse(JSON.stringify(row)));
			expect(parsed).toEqual(row);
		},
	);

	test("unknown columns are rejected, so the subset stays deliberate", () => {
		expect(
			workerCustomerEntitlementSchema.safeParse({
				...customerEntitlement,
				cache_version: 3,
			}).success,
		).toBe(false);
	});
});
