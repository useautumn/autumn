import type { FreeTrialDuration } from "@autumn/shared";

type RequestBody = Record<string, unknown>;

export type FieldReaders<Form> = {
	[K in keyof Form]?: (request: RequestBody) => Form[K] | undefined;
};

export const overridesFromRequest = <Form>(
	request: RequestBody,
	readers: FieldReaders<Form>,
): Partial<Form> => {
	const overrides: Partial<Form> = {};
	for (const key of Object.keys(readers) as Array<keyof Form>) {
		const value = readers[key]?.(request);
		if (value !== undefined) overrides[key] = value;
	}
	return overrides;
};

export const readString =
	(key: string) =>
	(request: RequestBody): string | undefined =>
		typeof request[key] === "string" ? (request[key] as string) : undefined;

export const readEnum =
	<T extends string>(key: string) =>
	(request: RequestBody): T | undefined =>
		typeof request[key] === "string" ? (request[key] as T) : undefined;

export const readNumber =
	(key: string) =>
	(request: RequestBody): number | undefined =>
		typeof request[key] === "number" ? (request[key] as number) : undefined;

export const readBoolean =
	(key: string) =>
	(request: RequestBody): boolean | undefined =>
		typeof request[key] === "boolean" ? (request[key] as boolean) : undefined;

export const readArray =
	<T>(key: string) =>
	(request: RequestBody): T[] | undefined =>
		Array.isArray(request[key]) ? (request[key] as T[]) : undefined;

export const readStringArray =
	(key: string) =>
	(request: RequestBody): string[] | undefined =>
		Array.isArray(request[key])
			? (request[key] as unknown[]).filter(
					(value): value is string => typeof value === "string",
				)
			: undefined;

export const readRewardIds =
	(key: string) =>
	(request: RequestBody): string[] | undefined =>
		Array.isArray(request[key])
			? (request[key] as { reward_id?: unknown }[]).flatMap((entry) =>
					typeof entry?.reward_id === "string" ? [entry.reward_id] : [],
				)
			: undefined;

export const readStampedArray =
	<T extends object>(key: string, idPrefix: string) =>
	(request: RequestBody): Array<T & { _id: string }> | undefined =>
		Array.isArray(request[key])
			? (request[key] as T[]).map((entry, index) => ({
					...entry,
					_id: `${idPrefix}-${index}`,
				}))
			: undefined;

export const readQuantities =
	(key: string, idKey: string) =>
	(request: RequestBody): Record<string, number> | undefined => {
		const quantities = quantityRecordFrom(request[key], idKey);
		return Object.keys(quantities).length ? quantities : undefined;
	};

export const requestRecord = (
	value: unknown,
): Record<string, unknown> | undefined =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

export const quantityRecordFrom = (
	value: unknown,
	idKey: string,
): Record<string, number> => {
	if (!Array.isArray(value)) return {};
	return Object.fromEntries(
		value.flatMap((entry) => {
			const id = requestRecord(entry)?.[idKey];
			const quantity = requestRecord(entry)?.quantity;
			return typeof id === "string" && typeof quantity === "number"
				? [[id, quantity]]
				: [];
		}),
	);
};

export const anchorOverridesFrom = (
	value: unknown,
): {
	billingCycleAnchorMode?: "now" | "custom";
	billingCycleAnchorDate?: number;
	resetBillingCycle?: boolean;
} => {
	if (value === "now") {
		return { billingCycleAnchorMode: "now", resetBillingCycle: true };
	}
	if (typeof value === "number") {
		return {
			billingCycleAnchorDate: value,
			billingCycleAnchorMode: "custom",
			resetBillingCycle: true,
		};
	}
	return {};
};

export const freeTrialFromRequest = (request: Record<string, unknown>) => {
	const customize = requestRecord(request.customize);
	return customize?.free_trial !== undefined
		? customize.free_trial
		: request.free_trial;
};

export const trialOverridesFrom = (
	value: unknown,
	options: { removable?: boolean } = {},
): {
	removeTrial?: boolean;
	trialCardRequired?: boolean;
	trialDuration?: FreeTrialDuration;
	trialEnabled?: boolean;
	trialLength?: number;
	trialOnEnd?: "bill" | "revert";
} => {
	if (value === null) {
		return options.removable
			? { removeTrial: true, trialEnabled: false }
			: { trialEnabled: false };
	}
	const trial = requestRecord(value);
	const length =
		typeof trial?.duration_length === "number"
			? trial.duration_length
			: trial?.length;
	const duration =
		typeof trial?.duration_type === "string"
			? trial.duration_type
			: trial?.duration;
	if (!trial || typeof length !== "number") return {};
	return {
		trialCardRequired: trial.card_required !== false,
		trialDuration: (typeof duration === "string"
			? duration
			: "day") as FreeTrialDuration,
		trialEnabled: true,
		trialLength: length,
		...(trial.on_end === "bill" || trial.on_end === "revert"
			? { trialOnEnd: trial.on_end }
			: {}),
	};
};

export const carryOverFrom = <Form>(
	value: unknown,
	fields: { enabled: keyof Form; featureIds: keyof Form },
): Partial<Form> => {
	const carryOver = requestRecord(value);
	if (!carryOver?.enabled) return {};
	return {
		[fields.enabled]: true,
		...(Array.isArray(carryOver.feature_ids)
			? { [fields.featureIds]: carryOver.feature_ids }
			: {}),
	} as Partial<Form>;
};
