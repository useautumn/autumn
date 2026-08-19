import { asRecord } from "../records.js";

/** Whether a plan item satisfies a `remove_items` filter. Every field the
 * filter names must match; fields it omits are wildcards. */
export const itemMatchesFilter = ({
	filter,
	item,
}: {
	filter: unknown;
	item: unknown;
}): boolean => {
	const itemRecord = asRecord(item);
	const filterRecord = asRecord(filter);
	if (!(itemRecord && filterRecord)) return false;
	const price = asRecord(itemRecord.price);
	const reset = asRecord(itemRecord.reset);
	return [
		[filterRecord.feature_id, itemRecord.feature_id],
		[filterRecord.billing_method, price?.billing_method],
		[filterRecord.interval, price?.interval ?? reset?.interval],
		[
			filterRecord.interval_count,
			price?.interval_count ?? reset?.interval_count,
		],
	].every(
		([expected, actual]) => expected === undefined || expected === actual,
	);
};
