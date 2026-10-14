import {
	type BillingInterval,
	BillingMethod,
	ErrCode,
	isFixedPrice,
	isPayPerUsePrice,
	isPrepaidPrice,
	isUsagePrice,
	type LineItem,
	RecaseError,
	type RemoveLine,
	type RemoveLinePrice,
} from "@autumn/shared";

type IntervalNarrow = {
	interval?: BillingInterval;
	interval_count?: number;
};

/** One thing a remove_lines entry points at, with the request path used in errors. */
type RemoveTarget = {
	path: string;
	matches: (lineItem: LineItem) => boolean;
	/** Whole-plan and whole-license targets remove every line, so they're never ambiguous. */
	narrowsToOnePrice: boolean;
};

const invalidRequest = (message: string) =>
	new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

export const ownerPlanId = (lineItem: LineItem) =>
	lineItem.context.customerProduct?.product.id ?? lineItem.context.product.id;

/** License lines are priced through the license plan but owned by the parent plan. */
export const licensePlanId = (lineItem: LineItem) => {
	const { product } = lineItem.context;
	return product.id !== ownerPlanId(lineItem) ? product.id : undefined;
};

export const lineEntityId = (lineItem: LineItem) =>
	lineItem.context.customerProduct?.entity_id ??
	lineItem.context.entity?.id ??
	null;

const intervalKey = (lineItem: LineItem) =>
	`${lineItem.context.price.config.interval}:${lineItem.context.price.config.interval_count ?? 1}`;

const matchesInterval = ({
	lineItem,
	narrow,
}: {
	lineItem: LineItem;
	narrow: IntervalNarrow;
}) => {
	const { config } = lineItem.context.price;
	if (narrow.interval && config.interval !== narrow.interval) return false;
	if (
		narrow.interval_count !== undefined &&
		(config.interval_count ?? 1) !== narrow.interval_count
	) {
		return false;
	}
	return true;
};

const isBasePriceLine = ({
	lineItem,
	price,
}: {
	lineItem: LineItem;
	price: RemoveLinePrice;
}) =>
	isFixedPrice(lineItem.context.price) &&
	matchesInterval({ lineItem, narrow: price === true ? {} : price });

const isFeatureLine = ({
	lineItem,
	featureQuantity,
}: {
	lineItem: LineItem;
	featureQuantity: IntervalNarrow & {
		feature_id: string;
		billing_behavior: BillingMethod;
	};
}) => {
	const { price } = lineItem.context;
	if (!isUsagePrice({ price, featureId: featureQuantity.feature_id })) {
		return false;
	}
	const matchesBehavior =
		featureQuantity.billing_behavior === BillingMethod.Prepaid
			? isPrepaidPrice(price)
			: isPayPerUsePrice({ price });
	return (
		matchesBehavior && matchesInterval({ lineItem, narrow: featureQuantity })
	);
};

const entryToTargets = ({
	entry,
	entryIndex,
	belongsToEntry,
}: {
	entry: RemoveLine;
	entryIndex: number;
	belongsToEntry: (lineItem: LineItem) => boolean;
}): RemoveTarget[] => {
	const entryPath = `remove_lines[${entryIndex}]`;
	const isPlanLine = (lineItem: LineItem) =>
		belongsToEntry(lineItem) && licensePlanId(lineItem) === undefined;
	const isLicenseLine = (lineItem: LineItem, licenseId: string) =>
		belongsToEntry(lineItem) && licensePlanId(lineItem) === licenseId;

	const hasSelectors =
		entry.price !== undefined ||
		entry.feature_quantities !== undefined ||
		entry.license_quantities !== undefined;
	if (!hasSelectors) {
		return [
			{ path: entryPath, matches: belongsToEntry, narrowsToOnePrice: false },
		];
	}

	const targets: RemoveTarget[] = [];
	const { price } = entry;
	if (price !== undefined) {
		targets.push({
			path: `${entryPath}.price`,
			matches: (lineItem) =>
				isPlanLine(lineItem) && isBasePriceLine({ lineItem, price }),
			narrowsToOnePrice: true,
		});
	}

	for (const [index, featureQuantity] of (
		entry.feature_quantities ?? []
	).entries()) {
		targets.push({
			path: `${entryPath}.feature_quantities[${index}]`,
			matches: (lineItem) =>
				isPlanLine(lineItem) && isFeatureLine({ lineItem, featureQuantity }),
			narrowsToOnePrice: true,
		});
	}

	for (const [licenseIndex, license] of (
		entry.license_quantities ?? []
	).entries()) {
		const licensePath = `${entryPath}.license_quantities[${licenseIndex}]`;
		const isThisLicense = (lineItem: LineItem) =>
			isLicenseLine(lineItem, license.license_plan_id);
		const licensePrice = license.price;

		if (
			licensePrice === undefined &&
			license.feature_quantities === undefined
		) {
			targets.push({
				path: licensePath,
				matches: isThisLicense,
				narrowsToOnePrice: false,
			});
			continue;
		}
		if (licensePrice !== undefined) {
			targets.push({
				path: `${licensePath}.price`,
				matches: (lineItem) =>
					isThisLicense(lineItem) &&
					isBasePriceLine({ lineItem, price: licensePrice }),
				narrowsToOnePrice: true,
			});
		}
		for (const [index, featureQuantity] of (
			license.feature_quantities ?? []
		).entries()) {
			targets.push({
				path: `${licensePath}.feature_quantities[${index}]`,
				matches: (lineItem) =>
					isThisLicense(lineItem) &&
					isFeatureLine({ lineItem, featureQuantity }),
				narrowsToOnePrice: true,
			});
		}
	}

	return targets;
};

const assertTargetMatchesOnePrice = ({
	target,
	matched,
}: {
	target: RemoveTarget;
	matched: LineItem[];
}) => {
	if (matched.length === 0) {
		throw invalidRequest(`${target.path} matches no line on this invoice`);
	}
	if (!target.narrowsToOnePrice) return;

	const intervals = new Set(matched.map(intervalKey));
	if (intervals.size > 1) {
		throw invalidRequest(
			`${target.path} matches lines on ${intervals.size} intervals; add interval to pick one`,
		);
	}
};

const resolveEntryEntityId = ({
	entry,
	requestEntityId,
}: {
	entry: RemoveLine;
	requestEntityId?: string;
}) =>
	entry.entity_id === undefined ? (requestEntityId ?? null) : entry.entity_id;

/** Every line one remove_lines entry would remove, without validating it. */
export const linesMatchedByRemoveLine = ({
	lineItems,
	entry,
	requestEntityId,
}: {
	lineItems: LineItem[];
	entry: RemoveLine;
	requestEntityId?: string;
}): LineItem[] => {
	const entityId = resolveEntryEntityId({ entry, requestEntityId });
	const belongsToEntry = (lineItem: LineItem) =>
		ownerPlanId(lineItem) === entry.plan_id &&
		lineEntityId(lineItem) === entityId &&
		(entry.direction === undefined ||
			lineItem.context.direction === entry.direction);
	const targets = entryToTargets({ entry, entryIndex: 0, belongsToEntry });
	return lineItems.filter((lineItem) =>
		targets.some((target) => target.matches(lineItem)),
	);
};

/** Drops the generated lines remove_lines points at; every entry must match, and only once. */
export const removeInvoiceLines = ({
	lineItems,
	removeLines,
	requestEntityId,
}: {
	lineItems: LineItem[];
	removeLines: RemoveLine[];
	requestEntityId?: string;
}): LineItem[] => {
	const removedBy = new Map<LineItem, string>();

	for (const [entryIndex, entry] of removeLines.entries()) {
		const entityId = resolveEntryEntityId({ entry, requestEntityId });
		const isPlanOnInvoice = (lineItem: LineItem) =>
			ownerPlanId(lineItem) === entry.plan_id &&
			lineEntityId(lineItem) === entityId;

		if (!lineItems.some(isPlanOnInvoice)) {
			throw invalidRequest(
				`remove_lines[${entryIndex}].plan_id "${entry.plan_id}" has no line on this invoice`,
			);
		}

		const belongsToEntry = (lineItem: LineItem) =>
			isPlanOnInvoice(lineItem) &&
			(entry.direction === undefined ||
				lineItem.context.direction === entry.direction);

		for (const target of entryToTargets({
			entry,
			entryIndex,
			belongsToEntry,
		})) {
			const matched = lineItems.filter(target.matches);
			assertTargetMatchesOnePrice({ target, matched });

			for (const lineItem of matched) {
				const earlierPath = removedBy.get(lineItem);
				if (earlierPath) {
					throw invalidRequest(
						`${earlierPath} and ${target.path} match the same line`,
					);
				}
				removedBy.set(lineItem, target.path);
			}
		}
	}

	return lineItems.filter((lineItem) => !removedBy.has(lineItem));
};
