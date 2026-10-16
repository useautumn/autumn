import { customerFilterMatchesFullCustomer } from "../../../../customers/utils/match/customerFilterMatchesFullCustomer";
import type { CustomerFilter } from "../../../../migrations/filters/customerFilter";
import { isPlainObject } from "../../../schemas/isPlainObject";
import type { ApprovalCustomerFacts } from "../../facts/customerFacts";
import type { ApprovalViolation } from "../../types/approvalViolation";
import { buildUnsupportedMatch } from "../buildUnsupportedMatch";
import type { FilterField, FilterMatch } from "../filterFieldTypes";
import { describeHasPaid } from "../format/describeHasPaid";
import { describeStringMatcher } from "../format/describeStringMatcher";
import { joinFieldPath } from "../joinFieldPath";
import { matchAll } from "../matchAll";
import { matchAny } from "../matchAny";

type CustomerLabels = {
	customer: string;
	"customer.customer_id": string;
	"customer.plan": string;
	"customer.item": string;
	"customer.has_paid": string;
};

type CustomerKey = "customer_id" | "has_paid" | "plan" | "item";

const describeKey = ({
	key,
	filter,
	customer,
}: {
	key: CustomerKey;
	filter: unknown;
	customer: ApprovalCustomerFacts;
}): Pick<ApprovalViolation, "limit" | "actual"> => {
	if (key === "customer_id")
		return {
			limit: describeStringMatcher({
				matcher: filter as NonNullable<CustomerFilter["customer_id"]> | null,
			}),
			actual: customer.id ?? "none",
		};
	if (key === "has_paid")
		return {
			limit: describeHasPaid({ hasPaid: filter as boolean }),
			actual: describeHasPaid({ hasPaid: customer.has_paid }),
		};
	return { limit: `matching ${key}`, actual: "matches" };
};

const CUSTOMER_KEYS: CustomerKey[] = [
	"customer_id",
	"has_paid",
	"plan",
	"item",
];

type MatchArgs = {
	customer: ApprovalCustomerFacts;
	labels: CustomerLabels;
	path: string;
};

/** One customer key, through the shared matcher so its semantics stay the migrations'. */
const matchCustomerKey = ({
	key,
	filter,
	customer,
	labels,
	path,
}: MatchArgs & { key: CustomerKey; filter: unknown }): FilterMatch => {
	const field = joinFieldPath({ path, key });
	try {
		const matches = customerFilterMatchesFullCustomer({
			filter: { [key]: filter },
			fullCustomer: customer,
			hasPaid: customer.has_paid,
		});
		if (!matches) return { result: "no_match" };
	} catch {
		// The shared string matcher throws on $regex / $startsWith.
		return buildUnsupportedMatch({ field, label: labels[`customer.${key}`] });
	}
	return {
		result: "match",
		conditions: [
			{
				field,
				label: labels[`customer.${key}`],
				...describeKey({ key, filter, customer }),
			},
		],
	};
};

/** Keys AND, `$and` adds up, `$or` reports its first matching branch, as in `matchFilter`. */
const matchCustomerFilter = ({
	filter,
	...args
}: MatchArgs & { filter: unknown }): FilterMatch => {
	if (!isPlainObject(filter))
		return buildUnsupportedMatch({
			field: args.path,
			label: args.labels.customer,
		});

	const entries = Object.entries(filter).filter(
		([, value]) => value !== undefined,
	);
	if (entries.length === 0)
		return {
			result: "match",
			conditions: [
				{
					field: args.path,
					label: args.labels.customer,
					limit: "any customer",
					actual: args.customer.id ?? "none",
				},
			],
		};

	return matchAll({
		items: entries,
		match: ({ item: [key, value] }) => {
			if (key === "$and" || key === "$or") {
				const isNonEmptyGroup = Array.isArray(value) && value.length > 0;
				if (!isNonEmptyGroup)
					return buildUnsupportedMatch({
						field: joinFieldPath({ path: args.path, key }),
					});
				const combine = key === "$and" ? matchAll : matchAny;
				return combine({
					items: value,
					match: ({ item: branch }) =>
						matchCustomerFilter({ ...args, filter: branch }),
				});
			}
			if (!CUSTOMER_KEYS.includes(key as CustomerKey))
				return buildUnsupportedMatch({
					field: joinFieldPath({ path: args.path, key }),
				});
			return matchCustomerKey({
				...args,
				key: key as CustomerKey,
				filter: value,
			});
		},
	});
};

/** The migration `CustomerFilter`, matched key by key by the shared in-memory matcher. */
export const customerField = <Parent>({
	labels,
	read,
}: {
	labels: CustomerLabels;
	read: (parent: Parent) => ApprovalCustomerFacts;
}): FilterField<Parent> => ({
	describeCondition: ({ filter }) => {
		const { customer_id, has_paid } = filter as CustomerFilter;
		const parts = [
			customer_id !== undefined &&
				describeStringMatcher({ matcher: customer_id }),
			has_paid !== undefined && describeHasPaid({ hasPaid: has_paid }),
		];
		return parts.filter(Boolean).join(", ") || "matching customer";
	},
	match: ({ filter, parent, path }) =>
		matchCustomerFilter({ filter, customer: read(parent), labels, path }),
});
