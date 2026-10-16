import {
	BYOC_CACHE_VOLUME_PRESETS_GIB,
	type ByocCacheMachine,
	byocCacheComputeMonthlyUsd,
	byocCacheMonthlyUsd,
	byocCacheStorageMonthlyUsd,
	IncreaseByocCacheStorageParamsSchema,
} from "@autumn/shared";

const VolumeSizeGibSchema =
	IncreaseByocCacheStorageParamsSchema.shape.volume_size_gib;

const WHOLE_GIB_MESSAGE = "Use a whole number of GiB";

const centsFormat = new Intl.NumberFormat("en-US", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

const dollarsFormat = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 0,
});

/** Both replicas' volumes a month, to the cent: e.g. "~$8.00". */
export const atomStorageMonthlyEstimate = ({
	volumeSizeGib,
}: {
	volumeSizeGib: number;
}) => `~$${centsFormat.format(byocCacheStorageMonthlyUsd({ volumeSizeGib }))}`;

/** What each GiB per replica costs a month across both volumes. */
export const ATOM_STORAGE_PER_GIB_LABEL = `$${centsFormat.format(
	byocCacheStorageMonthlyUsd({ volumeSizeGib: 1 }),
)} / GiB / mo`;

/** The month's estimate in whole dollars, and the compute and storage it adds up from. */
export const atomMonthlyCost = ({
	machine,
	volumeSizeGib,
}: {
	machine: ByocCacheMachine;
	volumeSizeGib: number;
}) => ({
	total: `$${dollarsFormat.format(byocCacheMonthlyUsd({ machine, volumeSizeGib }))}`,
	compute: `$${dollarsFormat.format(byocCacheComputeMonthlyUsd(machine))}`,
	storage: `$${dollarsFormat.format(byocCacheStorageMonthlyUsd({ volumeSizeGib }))}`,
});

/** The preset sizes larger than `aboveGib`; every preset for a new Atom. */
export const atomVolumePresets = ({
	aboveGib = 0,
}: {
	aboveGib?: number;
} = {}) => BYOC_CACHE_VOLUME_PRESETS_GIB.filter((gib) => gib > aboveGib);

/** A picked size: a preset, or Custom (`presetGib: null`) with the GiB typed beside it. */
export type AtomVolumeChoice = { presetGib: number | null; customGib: string };

/** `gib` is null until the choice names a valid size; `error` says why a typed one is not. */
export type AtomVolumeSize =
	| { gib: number; error: null }
	| { gib: null; error: string | null };

/** The size a choice names; a typed one must pass the API's bounds and, when growing, exceed `aboveGib`. */
export const atomVolumeSize = ({
	choice: { presetGib, customGib },
	aboveGib,
}: {
	choice: AtomVolumeChoice;
	aboveGib?: number;
}): AtomVolumeSize => {
	if (presetGib !== null) return { gib: presetGib, error: null };

	const text = customGib.trim();
	if (!text) return { gib: null, error: null };
	if (!/^\d+(\.\d+)?$/.test(text))
		return { gib: null, error: WHOLE_GIB_MESSAGE };

	const parsed = VolumeSizeGibSchema.safeParse(Number(text));
	if (!parsed.success)
		return {
			gib: null,
			error: parsed.error.issues[0]?.message ?? WHOLE_GIB_MESSAGE,
		};
	if (aboveGib !== undefined && parsed.data <= aboveGib)
		return { gib: null, error: `Use more than ${aboveGib} GiB` };
	return { gib: parsed.data, error: null };
};

/** Reopens a size as the choice that names it: its preset, else Custom with it typed in. */
export const volumeSizeToChoice = (volumeSizeGib: number): AtomVolumeChoice =>
	atomVolumePresets().some((gib) => gib === volumeSizeGib)
		? { presetGib: volumeSizeGib, customGib: "" }
		: { presetGib: null, customGib: String(volumeSizeGib) };
