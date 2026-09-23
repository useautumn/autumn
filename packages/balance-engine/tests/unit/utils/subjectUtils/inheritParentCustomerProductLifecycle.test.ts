import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { createSubjectState } from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerLicense,
	createCustomerProduct,
	createSubjectFor,
	identity,
} from "../../engineFixtures.js";

const SEAT_ENTITY = "ent_internal_seat";

const parent = ({ status }: { status: CusProductStatus }) =>
	createCustomerProduct({
		id: "cp_parent",
		status,
		subscriptionIds: ["sub_parent"],
		canceledAt: status === CusProductStatus.Active ? null : 1_700_000_000_000,
	});

const seat = () =>
	createCustomerProduct({
		id: "cp_seat",
		internalEntityId: SEAT_ENTITY,
		status: CusProductStatus.Expired,
		customerLicenseLinkId: "link_1",
		subscriptionIds: [],
		canceledAt: null,
	});

const seatGrant = () => ({
	...createCustomerEntitlement({ id: "seat_messages", balance: 500 }),
	customer_product_id: "cp_seat",
	internal_entity_id: SEAT_ENTITY,
});

describe("inheritSeatLifecycle", () => {
	test("a seat takes status, subscriptions and cancellation from the parent behind its license link, whatever its own columns say", () => {
		const state = createSubjectState({
			identity,
			customerProducts: [parent({ status: CusProductStatus.PastDue }), seat()],
			customerEntitlements: [seatGrant()],
			customerLicenses: [
				createCustomerLicense({
					linkId: "link_1",
					parentCustomerProductId: "cp_parent",
				}),
			],
		});
		const fullSubject = createSubjectFor({ state });
		const seatProduct = fullSubject.customer_products.find(
			({ id }) => id === "cp_seat",
		);
		expect(seatProduct).toMatchObject({
			status: CusProductStatus.PastDue,
			subscription_ids: ["sub_parent"],
			canceled_at: 1_700_000_000_000,
			customer_license_link_id: "link_1",
		});
		expect(seatProduct?.customer_entitlements.map(({ id }) => id)).toEqual([
			"seat_messages",
		]);
	});

	test("a seat with no live parent in state is left out with its grants; they never become loose", () => {
		const state = createSubjectState({
			identity,
			customerProducts: [seat()],
			customerEntitlements: [seatGrant()],
			customerLicenses: [
				createCustomerLicense({
					linkId: "link_1",
					parentCustomerProductId: "cp_gone",
				}),
			],
		});
		const fullSubject = createSubjectFor({ state });
		expect(fullSubject.customer_products).toEqual([]);
		expect(fullSubject.extra_customer_entitlements).toEqual([]);
	});

	test("a seat whose link names no license of the customer is left out", () => {
		const state = createSubjectState({
			identity,
			customerProducts: [parent({ status: CusProductStatus.Active }), seat()],
			customerEntitlements: [seatGrant()],
		});
		expect(
			createSubjectFor({ state }).customer_products.map(({ id }) => id),
		).toEqual(["cp_parent"]);
	});

	test("a product without a license link keeps its own columns", () => {
		const own = createCustomerProduct({
			id: "cp_own",
			status: CusProductStatus.Scheduled,
		});
		const state = createSubjectState({ identity, customerProducts: [own] });
		expect(createSubjectFor({ state }).customer_products[0]).toMatchObject({
			id: "cp_own",
			status: CusProductStatus.Scheduled,
		});
	});
});
