import type { StripeCouponWithPromoCodes } from "@autumn/shared";
import { useEffect, useState } from "react";
import {
	type DiscountOption,
	discountOptionMatchesSearch,
	stripeCouponToOption,
} from "@/components/forms/attach-v2/utils/discountOptionUtils";
import { useStripeCouponLookupQuery } from "@/hooks/queries/useStripeCouponLookupQuery";
import { useDebounce } from "@/hooks/useDebounce";

const LOOKUP_DEBOUNCE_MS = 300;

const mergeLookedUpCoupon = ({
	options,
	coupon,
}: {
	options: DiscountOption[];
	coupon: StripeCouponWithPromoCodes;
}): DiscountOption[] => {
	const lookedUp = stripeCouponToOption(coupon);
	const existing = options.find((option) => option.id === lookedUp.id);
	if (!existing) return [...options, lookedUp];

	// Already listed, just not under this code: make the code searchable on it.
	return options.map((option) =>
		option.id === lookedUp.id
			? {
					...option,
					searchTerms: [
						...new Set([...option.searchTerms, ...lookedUp.searchTerms]),
					],
				}
			: option,
	);
};

/**
 * Search for a discount picker. Filtering is local over the loaded options;
 * when the typed text matches nothing there, it is treated as a promotion
 * code and looked up in Stripe directly, and any coupon found is added to
 * the options so it can be picked.
 */
export const useDiscountSearch = ({
	options,
	isCouponAllowed = () => true,
}: {
	options: DiscountOption[];
	/** Same rule the caller used to build `options`, so a lookup can't bypass it. */
	isCouponAllowed?: (coupon: StripeCouponWithPromoCodes) => boolean;
}) => {
	const [search, setSearch] = useState("");
	const [lookedUpCoupons, setLookedUpCoupons] = useState<
		StripeCouponWithPromoCodes[]
	>([]);

	const code = useDebounce({
		value: search,
		delayMs: LOOKUP_DEBOUNCE_MS,
	}).trim();
	const hasLocalMatch = options.some((option) =>
		discountOptionMatchesSearch({ option, search: code }),
	);

	const { coupon, isFetching } = useStripeCouponLookupQuery({
		code,
		enabled: !hasLocalMatch,
	});

	// Keep every coupon found, so a picked one stays resolvable after the
	// search text moves on.
	useEffect(() => {
		if (!coupon) return;
		setLookedUpCoupons((previous) =>
			previous.some((known) => known.id === coupon.id)
				? previous
				: [...previous, coupon],
		);
	}, [coupon]);

	// The allowance is applied on every render rather than when a coupon is
	// stored, so a change in scope (e.g. the product) re-filters what's kept.
	const mergedOptions = lookedUpCoupons
		.filter(isCouponAllowed)
		.reduce(
			(merged, lookedUp) =>
				mergeLookedUpCoupon({ options: merged, coupon: lookedUp }),
			options,
		);

	return { options: mergedOptions, setSearch, isLookingUp: isFetching };
};
