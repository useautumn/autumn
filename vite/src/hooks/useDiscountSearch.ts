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

export const useDiscountSearch = ({
	options,
	isCouponAllowed = () => true,
}: {
	options: DiscountOption[];
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

	useEffect(() => {
		if (!coupon) return;
		setLookedUpCoupons((previous) =>
			previous.some((known) => known.id === coupon.id)
				? previous
				: [...previous, coupon],
		);
	}, [coupon]);

	const mergedOptions = lookedUpCoupons
		.filter(isCouponAllowed)
		.reduce(
			(merged, lookedUp) =>
				mergeLookedUpCoupon({ options: merged, coupon: lookedUp }),
			options,
		);

	return { options: mergedOptions, setSearch, isLookingUp: isFetching };
};
