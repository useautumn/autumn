import { describe, expect, test } from "bun:test";
import type { z } from "zod/v4";
import { workerCustomerSchema } from "../../../../src/models/subject/rows/workerCustomer.js";
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
	entities: {},
};

/** The columns commands decide on: all a customer row carried before the worker served `customers.get`. */
const customerLoggedBeforeWidening = {
	internal_id: "cus_internal_1",
	id: "cus_1",
	config: null,
	spend_limits: null,
	overage_allowed: null,
	usage_limits: null,
	usage_alerts: null,
};

const customer = {
	...customerLoggedBeforeWidening,
	org_id: "org_1",
	env: "sandbox",
	created_at: 1_700_000_000_000,
	name: "Ada",
	email: "ada@example.com",
	fingerprint: null,
	processor: { type: "stripe", id: "cus_stripe_1" },
	processors: null,
	metadata: { plan: "team" },
	send_email_receipts: false,
	currency: "usd",
	auto_topups: null,
};

const renderedCustomerProduct = {
	...customerProduct,
	product_id: "pro",
	customer_id: "cus_1",
	entity_id: null,
	updated_at: null,
	canceled: false,
	trial_ends_at: 1_800_000_000_000,
	canceled_at: null,
	free_trial_id: "ft_1",
	collection_method: "charge_automatically",
	subscription_ids: ["sub_1"],
	scheduled_ids: [],
	processor: { type: "stripe" },
	api_semver: null,
	is_custom: false,
	billing_version: "v1",
	external_id: null,
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
		["customer", workerCustomerSchema, customer],
		[
			"customer logged before the widening",
			workerCustomerSchema,
			customerLoggedBeforeWidening,
		],
		[
			"customer product with the columns customers.get renders",
			workerCustomerProductSchema,
			renderedCustomerProduct,
		],
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
