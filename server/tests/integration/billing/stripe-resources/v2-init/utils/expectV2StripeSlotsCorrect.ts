/**
 * V2 attach slot contract.
 *
 * Present / absent is the latest billing path only (no leftover empty /
 * placeholder / prepaid-v1 companion). `stripe_product_id` is not asserted —
 * that slot is changing.
 */

import { expect } from "bun:test";
import type { FullProduct, Price } from "@autumn/shared";
import {
	findBasePrice,
	findFeaturePrice,
	stripeConfigValue,
	type StripeResourceField,
} from "@tests/integration/utils/expectStripePriceResources.js";
import type Stripe from "stripe";

export type V2StripeSlotKind = "fixed" | "prepaid" | "consumable" | "allocated";

const leftoverSlots = [
	"stripe_empty_price_id",
	"stripe_placeholder_price_id",
] as const satisfies StripeResourceField[];

const expectSlotPresent = ({
	price,
	field,
	label,
}: {
	price: Price;
	field: StripeResourceField;
	label: string;
}) => {
	expect(
		stripeConfigValue({ price, field }),
		`${label}: ${field} present`,
	).toBeTruthy();
};

const expectSlotAbsent = ({
	price,
	field,
	label,
}: {
	price: Price;
	field: StripeResourceField;
	label: string;
}) => {
	expect(
		stripeConfigValue({ price, field }),
		`${label}: ${field} absent`,
	).toBeNull();
};

/** Assert the V2-required slots for `kind`, and that leftover slots stayed unset. */
export const expectV2StripeSlotsCorrect = ({
	price,
	kind,
	label,
}: {
	price: Price | undefined;
	kind: V2StripeSlotKind;
	label?: string;
}) => {
	const prefix = label ?? kind;
	expect(price, `${prefix}: price row missing`).toBeDefined();
	if (!price) return;

	for (const field of leftoverSlots) {
		expectSlotAbsent({ price, field, label: prefix });
	}

	if (kind === "fixed") {
		expectSlotPresent({ price, field: "stripe_price_id", label: prefix });
		expectSlotAbsent({
			price,
			field: "stripe_prepaid_price_v2_id",
			label: prefix,
		});
		expectSlotAbsent({ price, field: "stripe_meter_id", label: prefix });
		return;
	}

	if (kind === "prepaid") {
		expectSlotPresent({
			price,
			field: "stripe_prepaid_price_v2_id",
			label: prefix,
		});
		expectSlotAbsent({ price, field: "stripe_price_id", label: prefix });
		expectSlotAbsent({ price, field: "stripe_meter_id", label: prefix });
		return;
	}

	if (kind === "consumable") {
		expectSlotPresent({ price, field: "stripe_price_id", label: prefix });
		expectSlotPresent({ price, field: "stripe_meter_id", label: prefix });
		expectSlotAbsent({
			price,
			field: "stripe_prepaid_price_v2_id",
			label: prefix,
		});
		return;
	}

	expectSlotPresent({ price, field: "stripe_price_id", label: prefix });
	expectSlotAbsent({ price, field: "stripe_meter_id", label: prefix });
	expectSlotAbsent({
		price,
		field: "stripe_prepaid_price_v2_id",
		label: prefix,
	});
};

export const priceForV2SlotKind = ({
	product,
	kind,
	featureId,
}: {
	product: FullProduct;
	kind: V2StripeSlotKind;
	featureId?: string;
}): Price | undefined => {
	if (kind === "fixed") return findBasePrice({ product });
	if (!featureId) return undefined;
	return findFeaturePrice({ product, featureId });
};

export const slotForV2Kind = (
	kind: V2StripeSlotKind,
): "stripe_price_id" | "stripe_prepaid_price_v2_id" =>
	kind === "prepaid" ? "stripe_prepaid_price_v2_id" : "stripe_price_id";

/**
 * One Autumn slot id, used by every concurrent attach's Stripe subscription.
 * Also one Autumn-nicknamed Price on the Stripe product that slot lives on.
 */
export const expectSingleStripePriceInitialized = async ({
	price,
	kind,
	stripeCli,
	stripeCustomerIds,
	label,
}: {
	price: Price | undefined;
	kind: V2StripeSlotKind;
	stripeCli: Stripe;
	stripeCustomerIds: string[];
	label?: string;
}) => {
	const prefix = label ?? kind;
	expect(price, `${prefix}: price row missing`).toBeDefined();
	if (!price) return;

	const slot = slotForV2Kind(kind);
	const autumnId = stripeConfigValue({ price, field: slot });
	expect(autumnId, `${prefix}: ${slot} initialized`).toBeTruthy();

	const subscriptionPriceIds: string[] = [];
	for (const stripeCustomerId of stripeCustomerIds) {
		const subscriptions = await stripeCli.subscriptions.list({
			customer: stripeCustomerId,
		});
		for (const subscription of subscriptions.data) {
			for (const item of subscription.items.data) {
				subscriptionPriceIds.push(item.price.id);
			}
		}
	}

	expect(
		subscriptionPriceIds.length,
		`${prefix}: both attaches created Stripe subscription items`,
	).toBeGreaterThan(0);

	const uniqueIds = new Set([autumnId!, ...subscriptionPriceIds]);
	expect(
		uniqueIds.size,
		`${prefix}: one stripe price id (autumn=${autumnId}, subs=${subscriptionPriceIds.join(",")})`,
	).toBe(1);

	// Feature Stripe Products accumulate prices across the shared test org.
	// Assert this slot's Price, not that it is the only Autumn-nicknamed one.
	const stripePrice = await stripeCli.prices.retrieve(autumnId!);
	expect(
		hasAutumnPriceNickname(stripePrice.nickname),
		`${prefix}: ${autumnId} nickname is Autumn-minted (got ${stripePrice.nickname})`,
	).toBe(true);
};

const autumnPriceNicknamePrefixes = [
	"Base price",
	"Usage-based price",
	"Prepaid price",
] as const;

const hasAutumnPriceNickname = (nickname: string | null) =>
	autumnPriceNicknamePrefixes.some((prefix) =>
		(nickname ?? "").startsWith(prefix),
	);
