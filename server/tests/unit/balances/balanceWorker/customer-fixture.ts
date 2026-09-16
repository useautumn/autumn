import {
	ApiVersionClass,
	EntInterval,
	type FullSubject,
	LATEST_VERSION,
	SubjectType,
} from "@autumn/shared";
import { contexts } from "../../../utils/fixtures/db/contexts.js";
import { customerEntitlements } from "../../../utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "../../../utils/fixtures/db/customerProducts.js";
import { customers } from "../../../utils/fixtures/db/customers.js";
import { prices } from "../../../utils/fixtures/db/prices.js";

export function createCustomerFixture() {
	const customerEntitlement = customerEntitlements.create({
		id: "messages_grant",
		featureId: "messages",
		featureName: "Messages",
		allowance: 100,
		balance: 72,
		usageAllowed: false,
		interval: EntInterval.Month,
		nextResetAt: 1_800_000_000_000,
	});
	customerEntitlement.external_id = "public_grant";
	customerEntitlement.adjustment = 10;
	const customerProduct = customerProducts.create({
		productId: "pro",
		customerEntitlements: [customerEntitlement],
		customerPrices: [
			prices.createCustomer({
				price: prices.createFixed({ id: "base_price" }),
			}),
		],
	});
	const customer = customers.create({ customerProducts: [customerProduct] });
	customerEntitlement.internal_customer_id = customer.internal_id;
	customerProduct.internal_customer_id = customer.internal_id;
	const feature = customerEntitlement.entitlement.feature;
	const ctx = contexts.create({ features: [feature] });
	ctx.id = "worker-request";
	ctx.timestamp = 1_790_000_000_000;
	ctx.apiVersion = new ApiVersionClass(LATEST_VERSION);
	ctx.expand = [];
	ctx.extraLogs = {};
	ctx.scopes = [];
	const fullSubject: FullSubject = {
		subjectType: SubjectType.Customer,
		customerId: "cus_test",
		internalCustomerId: customer.internal_id,
		customer,
		customer_products: [customerProduct],
		extra_customer_entitlements: [],
		pooled_customer_entitlements: [],
		invoices: [],
	};
	return {
		ctx,
		fullSubject,
		customer,
		customerProduct,
		customerEntitlement,
		feature,
	};
}
