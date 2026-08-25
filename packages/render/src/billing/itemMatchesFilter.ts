import { loosePlanItemMatchesFilter } from "@autumn/shared";

export const itemMatchesFilter = ({
	filter,
	item,
}: {
	filter: unknown;
	item: unknown;
}): boolean => loosePlanItemMatchesFilter({ item, filter });
