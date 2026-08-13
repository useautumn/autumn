import type { CatalogFeatureUsage } from "@autumn/shared";

const formatCount = ({
	count,
	countCapped,
}: {
	count: number;
	countCapped: boolean;
}) => (countCapped ? `${count.toLocaleString("en-US")}+` : String(count));

const quoteName = (name: string) => `"${name}"`;

/** Plan / credit-system lines that have sample names. */
const formatNamedBucketMessage = ({
	singular,
	plural,
	count,
	countCapped,
	samples,
	singularVerb,
	pluralVerb,
}: {
	singular: string;
	plural: string;
	count: number;
	countCapped: boolean;
	samples: { id: string; name: string }[];
	singularVerb: string;
	pluralVerb: string;
}): string | null => {
	if (count <= 0) return null;

	if (countCapped && samples.length === 0) {
		return `${formatCount({ count, countCapped })} ${plural} ${pluralVerb}.`;
	}

	const first = samples[0];
	if (!first) {
		return count === 1
			? `${singular} ${singularVerb}.`
			: `${plural} ${pluralVerb}.`;
	}

	if (count === 1) {
		return `${singular} ${quoteName(first.name)} ${singularVerb}.`;
	}

	if (countCapped) {
		return `${plural} ${quoteName(first.name)} and ${formatCount({
			count,
			countCapped: true,
		})} others ${pluralVerb}.`;
	}

	const otherCount = count - 1;
	return `${plural} ${quoteName(first.name)} and ${otherCount} other ${
		otherCount === 1 ? singular.toLowerCase() : plural.toLowerCase()
	} ${pluralVerb}.`;
};

const formatCustomerMessage = ({
	count,
	countCapped,
	samples,
}: {
	count: number;
	countCapped: boolean;
	samples: { id: string; name: string }[];
}): string | null => {
	if (count <= 0) return null;

	const first = samples[0];
	if (!first) {
		if (countCapped) {
			return `Attached to ${formatCount({ count, countCapped })} customers.`;
		}
		return count === 1
			? "Attached to a customer."
			: `Attached to ${count} customers.`;
	}

	if (count === 1) {
		return `Attached to customer ${quoteName(first.name)}.`;
	}

	if (countCapped) {
		return `Attached to customer ${quoteName(first.name)} and ${formatCount({
			count,
			countCapped: true,
		})} more.`;
	}

	const otherCount = count - 1;
	return `Attached to customer ${quoteName(first.name)} and ${otherCount} more.`;
};

/** Pure: usage buckets → dialog-ready reason messages (non-empty only). */
export const formatFeatureUsageMessages = ({
	usage,
}: {
	usage: CatalogFeatureUsage;
}): { message: string }[] => {
	const messages = [
		formatNamedBucketMessage({
			singular: "Plan",
			plural: "Plans",
			count: usage.plans.count,
			countCapped: usage.plans.count_capped,
			samples: usage.plans.samples,
			singularVerb: "is using this feature",
			pluralVerb: "are using this feature",
		}),
		formatNamedBucketMessage({
			singular: "Credit system",
			plural: "Credit systems",
			count: usage.credit_systems.count,
			countCapped: usage.credit_systems.count_capped,
			samples: usage.credit_systems.samples,
			singularVerb: "references this feature",
			pluralVerb: "reference this feature",
		}),
		formatCustomerMessage({
			count: usage.customers.count,
			countCapped: usage.customers.count_capped,
			samples: usage.customers.samples,
		}),
	];

	return messages.flatMap((message) => (message ? [{ message }] : []));
};
