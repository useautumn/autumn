import {
	type ApiCustomer,
	type ApiSubscription,
	ApiVersion,
	type CreateFreeTrial,
	CusProductStatus,
	type Entitlement,
	type ProductV2,
} from "@autumn/shared";
import type { Customer, ProductItem } from "autumn-js";
import { expect } from "chai";
import { AutumnInt } from "../../../src/external/autumn/autumnCli";

export const expectProductAttached = ({
	customer,
	product,
	productId,
	status,
	entityId,
	isCanceled = false,
	quantity,
}: {
	customer: Customer;
	product?: ProductV2;
	productId?: string;
	status?: CusProductStatus;
	entityId?: string;
	isCanceled?: boolean;
	quantity?: number;
}) => {
	const cusProducts = customer.products;
	const finalProductId = productId || product?.id;
	const productAttached = cusProducts.find(
		(p) => p.id === finalProductId,
		// && (entityId ? p.entity_id === entityId : true),
	);

	expect(
		productAttached,
		`product ${finalProductId} not attached to ${customer.id}`,
	).to.exist;

	if (status) {
		expect(productAttached?.status).to.equal(
			status,
			`product ${finalProductId} should have status ${status}`,
		);
	} else {
		expect(
			productAttached?.status,
			`product ${finalProductId} is not expired`,
		).to.not.equal(CusProductStatus.Expired);
	}

	if (quantity) {
		// @ts-expect-error
		expect(productAttached?.quantity).to.equal(quantity);
	}

	// if (entityId) {
	// 	expect(productAttached?.entity_id).to.equal(entityId);
	// }

	if (isCanceled) {
		expect(productAttached?.canceled_at).to.exist;
		// expect(productAttached?.canceled).to.be.true;
	}
};

export const expectProductGroupCount = ({
	customer,
	group,
	count,
}: {
	customer: Customer;
	group: string;
	count: number;
}) => {
	const productCount = customer.products.reduce((acc: number, product: any) => {
		if (product.group === group) {
			return acc + 1;
		} else return acc;
	}, 0);

	expect(
		productCount,
		`customer should have ${count} products in group ${group}`,
	).to.equal(count);
};

export const expectScheduledApiSub = async ({
	customerId,
	entityId,
	productId,
}: {
	customerId: string;
	entityId?: string;
	productId: string;
}) => {
	const autumnV2 = new AutumnInt({
		version: ApiVersion.V2_0,
		secretKey: process.env.UNIT_TEST_AUTUMN_SECRET_KEY,
	});

	const entity = entityId
		? await autumnV2.entities.get(customerId, entityId)
		: await autumnV2.customers.get<ApiCustomer>(customerId);

	const scheduledSub = entity.scheduled_subscriptions.find(
		(s: ApiSubscription) => s.plan_id === productId,
	);
	expect(scheduledSub, `scheduled subscription ${productId} is attached`).to
		.exist;
};

export const expectProductV1Attached = ({
	customer,
	product,
	productId,
	status,
	entityId,
}: {
	customer: Customer;
	product: {
		id: string;
		isDefault?: boolean;
		isAddOn?: boolean;
		items?: Record<string, ProductItem>;
		entitlements: Record<string, Entitlement>;
		prices: any[];
		freeTrial?: CreateFreeTrial;
		group?: string;
	};
	productId?: string;
	status?: CusProductStatus;
	entityId?: string;
}) => {
	const cusProducts = customer.products;
	const finalProductId = productId || product?.id;
	const productAttached = cusProducts.find(
		(p) =>
			p.id === finalProductId && (entityId ? p.entity_id === entityId : true),
	);

	expect(productAttached, `product ${finalProductId} is attached`).to.exist;

	if (status) {
		expect(productAttached?.status).to.equal(
			status,
			`product ${finalProductId} should have status ${status}`,
		);
	}
};

export const expectAddOnAttached = ({
	customer,
	productId,
	status,
}: {
	customer: Customer & {
		add_ons: {
			id: string;
			status: CusProductStatus;
		}[];
	};
	productId: string;
	status?: CusProductStatus;
}) => {
	const addOn = customer.add_ons.find((a) => a.id === productId);
	expect(addOn, `add on ${productId} is attached`).to.exist;

	if (status) {
		expect(addOn?.status).to.equal(
			status,
			`add on ${productId} should have status ${status}`,
		);
	}
};

export const expectInvoicesCorrect = ({
	customer,
	first,
	// second,
}: {
	customer: Customer;
	first: {
		productId: string;
		total: number;
	};
	// second?: {
	//   productId: string;
	//   total: number;
	// };
}) => {
	const invoices = customer.invoices;
	if (!invoices) {
		console.log(`invoices is nullish`);
	}

	try {
		expect(invoices![0].total).to.approximately(
			first.total,
			0.01,
			`invoice total is correct: ${first.total}`,
		);

		expect(invoices![0].product_ids).to.include(
			first.productId,
			`invoice includes product ${first.productId}`,
		);
	} catch (error) {
		console.log(`invoice for ${first.productId}, ${first.total} not found`);
		throw error;
	}
};
