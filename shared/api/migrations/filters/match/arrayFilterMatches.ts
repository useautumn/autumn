/**
 * Generic in-memory evaluator for the `arrayFilter` quantifier shape.
 *
 * `filter` is either a bare element filter (implicit `$some`) or a
 * `{ $some?, $every?, $none? }` wrapper. Multiple quantifiers in the
 * same wrapper are AND'd.
 *
 * Reusable across any nav — pass the element matcher as `matchesElement`.
 */
export type ArrayQuantifierFilter<ElementFilter> =
	| ElementFilter
	| {
			$some?: ElementFilter;
			$every?: ElementFilter;
			$none?: ElementFilter;
	  };

export const arrayFilterMatches = <Item, ElementFilter>({
	filter,
	items,
	matchesElement,
}: {
	filter: ArrayQuantifierFilter<ElementFilter>;
	items: Item[];
	matchesElement: ({
		filter,
		item,
	}: {
		filter: ElementFilter;
		item: Item;
	}) => boolean;
}): boolean => {
	const wrapped = isQuantifierWrapper<ElementFilter>(filter)
		? filter
		: { $some: filter };

	if (
		wrapped.$some !== undefined &&
		!items.some((item) =>
			matchesElement({ filter: wrapped.$some as ElementFilter, item }),
		)
	) {
		return false;
	}

	if (
		wrapped.$every !== undefined &&
		!items.every((item) =>
			matchesElement({ filter: wrapped.$every as ElementFilter, item }),
		)
	) {
		return false;
	}

	if (
		wrapped.$none !== undefined &&
		items.some((item) =>
			matchesElement({ filter: wrapped.$none as ElementFilter, item }),
		)
	) {
		return false;
	}

	return true;
};

const isQuantifierWrapper = <ElementFilter>(
	value: ArrayQuantifierFilter<ElementFilter>,
): value is {
	$some?: ElementFilter;
	$every?: ElementFilter;
	$none?: ElementFilter;
} => {
	if (typeof value !== "object" || value === null) return false;
	return "$some" in value || "$every" in value || "$none" in value;
};
