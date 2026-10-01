import type {
	Feature,
	FullCusProduct,
	SetPlansPreviewPlan,
} from "@autumn/shared";
import { customerProductsAreSame } from "@/internal/billing/v2/actions/setPlans/utils/customerProductsAreSame";

export type PhasePlanStatus = SetPlansPreviewPlan["status"];

export type PhasePlanDiff =
	| { status: "starts"; before: null; after: FullCusProduct }
	| { status: "ends"; before: FullCusProduct; after: null }
	| {
			status: "kept" | "updated";
			before: FullCusProduct;
			after: FullCusProduct;
	  };

const STATUS_ORDER: PhasePlanStatus[] = ["starts", "updated", "ends", "kept"];

const planKey = (customerProduct: FullCusProduct) =>
	`${customerProduct.product_id}:${customerProduct.internal_entity_id ?? ""}`;

const groupByPlanKey = (customerProducts: FullCusProduct[]) => {
	const groups = new Map<string, FullCusProduct[]>();
	for (const customerProduct of customerProducts) {
		const key = planKey(customerProduct);
		const group = groups.get(key) ?? [];
		group.push(customerProduct);
		groups.set(key, group);
	}
	return groups;
};

type RowPair = { before: FullCusProduct; after: FullCusProduct };

/** Pairs each after row with the first unpaired before row it matches, removing both from the pools. */
const pairRows = ({
	unpairedBefore,
	unpairedAfter,
	matches,
}: {
	unpairedBefore: FullCusProduct[];
	unpairedAfter: FullCusProduct[];
	matches: (pair: RowPair) => boolean;
}): RowPair[] => {
	const pairs: RowPair[] = [];
	for (const after of [...unpairedAfter]) {
		const beforeIndex = unpairedBefore.findIndex((before) =>
			matches({ before, after }),
		);
		if (beforeIndex === -1) continue;
		const [before] = unpairedBefore.splice(beforeIndex, 1);
		unpairedAfter.splice(unpairedAfter.indexOf(after), 1);
		pairs.push({ before, after });
	}
	return pairs;
};

/** Rows pair by identity, then by identical plan, then by order, so duplicates of a plan only report real changes. */
const diffSamePlanKey = ({
	features,
	before,
	after,
}: {
	features: Feature[];
	before: FullCusProduct[];
	after: FullCusProduct[];
}): PhasePlanDiff[] => {
	const unpairedBefore = [...before];
	const unpairedAfter = [...after];
	const isSame = (pair: RowPair) =>
		customerProductsAreSame({ features, ...pair });

	const sameRowPairs = pairRows({
		unpairedBefore,
		unpairedAfter,
		matches: (pair) => pair.before.id === pair.after.id,
	});
	const identicalPairs = pairRows({
		unpairedBefore,
		unpairedAfter,
		matches: isSame,
	});
	const replacedPairs = pairRows({
		unpairedBefore,
		unpairedAfter,
		matches: () => true,
	});

	return [
		...[...sameRowPairs, ...identicalPairs, ...replacedPairs].map(
			(pair): PhasePlanDiff => ({
				status: isSame(pair) ? "kept" : "updated",
				...pair,
			}),
		),
		...unpairedAfter.map(
			(customerProduct): PhasePlanDiff => ({
				status: "starts",
				before: null,
				after: customerProduct,
			}),
		),
		...unpairedBefore.map(
			(customerProduct): PhasePlanDiff => ({
				status: "ends",
				before: customerProduct,
				after: null,
			}),
		),
	];
};

/** Each plan's status in a phase: what the request holds there compared with what the customer had saved. */
export const diffPhasePlans = ({
	features,
	before,
	after,
}: {
	features: Feature[];
	before: FullCusProduct[];
	after: FullCusProduct[];
}): PhasePlanDiff[] => {
	const beforeByKey = groupByPlanKey(before);
	const afterByKey = groupByPlanKey(after);
	const planKeys = new Set([...afterByKey.keys(), ...beforeByKey.keys()]);

	return [...planKeys]
		.flatMap((key) =>
			diffSamePlanKey({
				features,
				before: beforeByKey.get(key) ?? [],
				after: afterByKey.get(key) ?? [],
			}),
		)
		.sort(
			(first, second) =>
				STATUS_ORDER.indexOf(first.status) -
				STATUS_ORDER.indexOf(second.status),
		);
};
