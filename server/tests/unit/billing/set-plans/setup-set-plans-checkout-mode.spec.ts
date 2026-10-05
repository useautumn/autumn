/** A later first phase bills nothing now, so it skips checkout unless an ongoing plan is charged today. */

import { describe, expect, test } from "bun:test";
import type {
	CreateScheduleBillingContext,
	FullProduct,
	MultiAttachProductContext,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { setupSetPlansCheckoutMode } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansCheckoutMode";
import { paidProduct } from "./timeline/setPlansContextFixtures";

const pro = paidProduct({ id: "pro" });
const paidAddOn = paidProduct({ id: "seats", isAddOn: true });
const freeAddOn = products.createFull({ id: "free_add_on", isAddOn: true });

const productContext = ({
	fullProduct,
	unscheduled = false,
}: {
	fullProduct: FullProduct;
	unscheduled?: boolean;
}) => ({ fullProduct, unscheduled }) as MultiAttachProductContext;

const checkoutModeFor = ({
	productContexts,
	startsInFuture,
}: {
	productContexts: MultiAttachProductContext[];
	startsInFuture: boolean;
}) =>
	setupSetPlansCheckoutMode({
		billingContext: {
			fullProducts: productContexts.map(({ fullProduct }) => fullProduct),
			productContexts,
		} as unknown as CreateScheduleBillingContext,
		redirectMode: "if_required",
		startsInFuture,
	});

describe("setupSetPlansCheckoutMode", () => {
	test("a customer without a card checks out for a plan starting now", () => {
		expect(
			checkoutModeFor({
				productContexts: [productContext({ fullProduct: pro })],
				startsInFuture: false,
			}),
		).toBe("stripe_checkout");
	});

	test("a later first phase alone skips checkout", () => {
		expect(
			checkoutModeFor({
				productContexts: [productContext({ fullProduct: pro })],
				startsInFuture: true,
			}),
		).toBeNull();
	});

	test("a later first phase with a free ongoing plan skips checkout", () => {
		expect(
			checkoutModeFor({
				productContexts: [
					productContext({ fullProduct: pro }),
					productContext({ fullProduct: freeAddOn, unscheduled: true }),
				],
				startsInFuture: true,
			}),
		).toBeNull();
	});

	test("a paid ongoing plan charged today still checks out under a later first phase", () => {
		expect(
			checkoutModeFor({
				productContexts: [
					productContext({ fullProduct: pro }),
					productContext({ fullProduct: paidAddOn, unscheduled: true }),
				],
				startsInFuture: true,
			}),
		).toBe("stripe_checkout");
	});
});
