import type { FullProduct, Price } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { appendToExtraLogs } from "@/utils/logging/addToExtraLogs";

export type StripePriceReuseResult =
	| "skipped"
	| "no-candidate"
	| "reuse-level"
	| "unusable"
	| "stamped";

export type StripePriceReuseEntry = {
	result: StripePriceReuseResult;
	reason?: string;
	currency: string;
	product: FullProduct;
	targetPrice: Price;
	targetAmount?: number | null;
	targetInterval?: string | null;
	candidatePrice?: Price | null;
	candidateStripePriceId?: string | null;
	reuseLevel?: string;
	expectedStripeProductId?: string | null;
	retrievedStripeProductId?: string | null;
	stripePriceId?: string | null;
};

const formatPrice = ({
	price,
	amount,
	interval,
	stripePriceId,
}: {
	price: Price;
	amount?: number | null;
	interval?: string | null;
	stripePriceId?: string | null;
}) => {
	const money = amount != null ? `$${amount}` : "";
	const cadence = interval ? `/${interval}` : "";
	const scope = price.is_custom ? " custom" : " catalog";
	const stripe = stripePriceId ? ` ${stripePriceId}` : "";
	return `${price.id} ${money}${cadence}${scope}${stripe}`.trim();
};

const formatProduct = ({ product }: { product: FullProduct }) => {
	const processor = product.processor?.id ?? "none";
	return `${product.id} v${product.version} processor=${processor}`;
};

export const logStripePriceReuse = ({
	ctx,
	entry,
}: {
	ctx: AutumnContext;
	entry: StripePriceReuseEntry;
}) => {
	appendToExtraLogs({
		ctx,
		key: "stripePriceReuse",
		value: {
			result: entry.result,
			reason: entry.reason ?? "none",
			target: formatPrice({
				price: entry.targetPrice,
				amount: entry.targetAmount,
				interval: entry.targetInterval,
				stripePriceId: entry.stripePriceId,
			}),
			product: formatProduct({ product: entry.product }),
			currency: entry.currency,
			candidate: entry.candidatePrice
				? formatPrice({
						price: entry.candidatePrice,
						stripePriceId: entry.candidateStripePriceId,
					})
				: "none",
			reuseLevel: entry.reuseLevel ?? "none",
			expectedProduct: entry.expectedStripeProductId ?? "none",
			retrievedProduct: entry.retrievedStripeProductId ?? "none",
		},
	});
};
