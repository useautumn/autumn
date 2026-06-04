export type RateLimitRedisAllowlistConfig = {
	customerIds: string[];
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const DEFAULT_CONFIG: RateLimitRedisAllowlistConfig = {
	customerIds: [],
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

export const getEditableConfig = ({
	config,
}: {
	config: RateLimitRedisAllowlistConfig;
}) => ({
	customerIds: config.customerIds,
});

export const buildEditableJsonText = ({
	config,
}: {
	config: RateLimitRedisAllowlistConfig;
}): string => JSON.stringify(getEditableConfig({ config }), null, 2);

export type InitialResetUpdate = {
	loading: true;
	loadFailed: false;
	config: RateLimitRedisAllowlistConfig;
	jsonText: string;
	jsonError: null;
	syncSource: "form";
};

export const buildInitialResetUpdate = (): InitialResetUpdate => ({
	loading: true,
	loadFailed: false,
	config: DEFAULT_CONFIG,
	jsonText: buildEditableJsonText({ config: DEFAULT_CONFIG }),
	jsonError: null,
	syncSource: "form",
});

export type FetchSuccessUpdate = {
	loading: false;
	config: RateLimitRedisAllowlistConfig;
	jsonText: string;
	jsonError: null;
	syncSource: "form";
};

export const buildFetchSuccessUpdate = ({
	data,
}: {
	data: RateLimitRedisAllowlistConfig;
}): FetchSuccessUpdate => {
	const merged: RateLimitRedisAllowlistConfig = { ...DEFAULT_CONFIG, ...data };
	return {
		loading: false,
		config: merged,
		jsonText: buildEditableJsonText({ config: merged }),
		jsonError: null,
		syncSource: "form",
	};
};

export type FetchFailureUpdate = {
	loading: false;
	loadFailed: true;
};

export const buildFetchFailureUpdate = (): FetchFailureUpdate => ({
	loading: false,
	loadFailed: true,
});

export const isSaveDisabled = ({
	loading,
	loadFailed,
	jsonError,
}: {
	loading: boolean;
	loadFailed: boolean;
	jsonError: string | null;
}): boolean => loading || loadFailed || jsonError !== null;

export type LoadAllowlistConfigHandlers = {
	axiosGet: () => Promise<{ data: RateLimitRedisAllowlistConfig }>;
	isCancelled: () => boolean;
	applyInitialReset: (update: InitialResetUpdate) => void;
	applySuccess: (update: FetchSuccessUpdate) => void;
	applyFailure: (update: FetchFailureUpdate) => void;
	onError: (error: unknown) => void;
};

export async function loadAllowlistConfig(
	handlers: LoadAllowlistConfigHandlers,
): Promise<void> {
	handlers.applyInitialReset(buildInitialResetUpdate());

	try {
		const { data } = await handlers.axiosGet();
		if (handlers.isCancelled()) return;
		handlers.applySuccess(buildFetchSuccessUpdate({ data }));
	} catch (error) {
		if (handlers.isCancelled()) return;
		handlers.applyFailure(buildFetchFailureUpdate());
		handlers.onError(error);
	}
}
