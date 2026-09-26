import type {
	CustomerDisplayInfo,
	EntityDisplayInfo,
	EventAggregateListItemV1,
} from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { RESERVED_GROUP } from "../utils/displayLabels";

/** The display-names endpoint caps each id list at this size. */
const MAX_IDS = 500;

export type GroupDisplayNames = {
	customerNames?: Record<string, CustomerDisplayInfo>;
	entityNames?: Record<string, EntityDisplayInfo>;
	planNames?: Record<string, string>;
};

const collectGroupValues = ({
	list,
}: {
	list: EventAggregateListItemV1[];
}): string[] => {
	const values = new Set<string>();
	for (const item of list) {
		for (const byGroup of Object.values(item.grouped_values ?? {})) {
			for (const value of Object.keys(byGroup)) {
				if (value && value !== RESERVED_GROUP) values.add(value);
			}
		}
	}
	return [...values].sort().slice(0, MAX_IDS);
};

/** Names for the customer, entity or plan groups an aggregate is split by. */
export const fetchGroupDisplayNames = async ({
	axiosInstance,
	groupBy,
	list,
}: {
	axiosInstance: AxiosInstance;
	groupBy?: string | null;
	list: EventAggregateListItemV1[];
}): Promise<GroupDisplayNames> => {
	const includePlans = groupBy === "plan_id";
	const isNamedGroup =
		groupBy === "customer_id" || groupBy === "entity_id" || includePlans;
	if (!isNamedGroup) return {};

	const groupValues = includePlans ? [] : collectGroupValues({ list });
	if (!includePlans && groupValues.length === 0) return {};

	const { data } = await axiosInstance.post<Required<GroupDisplayNames>>(
		"/query/display_names",
		{
			customer_ids: groupBy === "customer_id" ? groupValues : [],
			entity_ids: groupBy === "entity_id" ? groupValues : [],
			include_plans: includePlans,
		},
	);

	return {
		customerNames: groupBy === "customer_id" ? data.customerNames : undefined,
		entityNames: groupBy === "entity_id" ? data.entityNames : undefined,
		planNames: includePlans ? data.planNames : undefined,
	};
};
