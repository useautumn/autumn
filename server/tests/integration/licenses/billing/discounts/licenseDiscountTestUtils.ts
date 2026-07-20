import { expect } from "bun:test";
import {
	BillingInterval,
	type BillingPreviewResponse,
	type PreviewLineItem,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";
import { ProductService } from "@/internal/products/ProductService";

export const PAID_PARENT_PRICE = 50;
export const DEVELOPER_SEAT_PRICE = 20;
export const VIEWER_SEAT_PRICE = 10;

export const setupPaidParentLicenseScenario = async ({
	customerId,
	idPrefix,
}: {
	customerId: string;
	idPrefix: string;
}) => {
	const parent = products.base({
		id: `${idPrefix}-parent`,
		items: [
			items.monthlyPrice({ price: PAID_PARENT_PRICE }),
			items.dashboard(),
		],
	});
	const developerSeat = products.base({
		id: `${idPrefix}-developer-seat`,
		group: `${idPrefix}-developer-licenses`,
		items: [items.monthlyPrice({ price: DEVELOPER_SEAT_PRICE })],
	});
	const viewerSeat = products.base({
		id: `${idPrefix}-viewer-seat`,
		group: `${idPrefix}-viewer-licenses`,
		items: [items.monthlyPrice({ price: VIEWER_SEAT_PRICE })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [parent, developerSeat, viewerSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: developerSeat.id,
				included: 0,
			}),
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: viewerSeat.id,
				included: 0,
			}),
		],
	});

	return { ...scenario, parent, developerSeat, viewerSeat };
};

export const customLicensePriceConfig = ({ amount }: { amount: number }) => ({
	price: { amount, interval: BillingInterval.Month },
});

export const customLicensePrice = ({
	planId,
	amount,
	included = 0,
}: {
	planId: string;
	amount: number;
	included?: number;
}) => ({
	license_plan_id: planId,
	included,
	customize: customLicensePriceConfig({ amount }),
});

export const getPlanStripeProductId = async ({
	ctx,
	planId,
}: {
	ctx: TestContext;
	planId: string;
}) => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	if (!product.processor?.id) {
		throw new Error(`Plan ${planId} has no Stripe product`);
	}

	return product.processor.id;
};

export const findPreviewLine = ({
	preview,
	planId,
	direction,
}: {
	preview: Pick<BillingPreviewResponse, "line_items">;
	planId: string;
	direction: "charge" | "refund";
}): PreviewLineItem => {
	const line = preview.line_items.find(
		(item) =>
			item.plan_id === planId &&
			(direction === "charge" ? item.subtotal > 0 : item.subtotal < 0),
	);

	if (!line) {
		throw new Error(`Missing ${direction} line for license ${planId}`);
	}

	return line;
};

type ExpectedLicensePreviewDiscount = {
	rewardId: string;
	amountOff: number;
	percentOff?: number;
};

export const expectLicensePreviewLineCorrect = ({
	preview,
	planId,
	direction,
	subtotal,
	total,
	quantity,
	discounts = [],
}: {
	preview: Pick<BillingPreviewResponse, "line_items">;
	planId: string;
	direction: "charge" | "refund";
	subtotal: number;
	total: number;
	quantity?: number;
	discounts?: ExpectedLicensePreviewDiscount[];
}) => {
	const line = findPreviewLine({ preview, planId, direction });

	expect(line.subtotal).toBe(subtotal);
	expect(line.total).toBe(total);
	if (quantity !== undefined) {
		expect(line.quantity).toBe(quantity);
	}

	expect(line.discounts).toHaveLength(discounts.length);
	for (const [index, expectedDiscount] of discounts.entries()) {
		const actualDiscount = line.discounts[index];
		expect(actualDiscount?.reward_id).toBe(expectedDiscount.rewardId);
		expect(actualDiscount?.amount_off).toBe(expectedDiscount.amountOff);
		if (expectedDiscount.percentOff !== undefined) {
			expect(actualDiscount?.percent_off).toBe(expectedDiscount.percentOff);
		}
	}

	return line;
};

export const expectLicenseDiscountPreviewCorrect = ({
	preview,
	total,
	nextCycleTotal,
}: {
	preview: Pick<BillingPreviewResponse, "total" | "next_cycle">;
	total: number;
	/** Pass null when the preview should not have a next cycle. */
	nextCycleTotal?: number | null;
}) => {
	expect(preview.total).toBe(total);

	if (nextCycleTotal === undefined) return;
	expectPreviewNextCycleCorrect({
		preview,
		expectDefined: nextCycleTotal !== null,
		total: nextCycleTotal ?? undefined,
	});
};

export const getStripeSubscriptionCouponIds = (
	subscription: Stripe.Subscription,
) =>
	(subscription.discounts ?? []).flatMap((discount) => {
		if (typeof discount === "string") return [];
		const sourceCoupon = discount.source?.coupon;
		if (!sourceCoupon) return [];
		return [typeof sourceCoupon === "string" ? sourceCoupon : sourceCoupon.id];
	});
