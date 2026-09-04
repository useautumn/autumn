import type { OnboardingStatus } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import {
	readDismissed,
	readSnapshot,
	setDismissed,
	writeSnapshot,
} from "./onboardingSnapshot";

/** Steps only ever complete, so polling can stop once everything is done. */
const REFETCH_INTERVAL = 10_000;

export const ONBOARDING_STEP_IDS = [
	"prompt",
	"catalog",
	"customer",
	"usage",
	"deploy",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

interface OnboardingDismissedState {
	isDismissed: boolean;
	dismiss: () => void;
	show: () => void;
}

const useOnboardingDismissedStore = create<OnboardingDismissedState>()(
	(set) => ({
		isDismissed: readDismissed(),
		dismiss: () => {
			setDismissed({ dismissed: true });
			set({ isDismissed: true });
		},
		show: () => {
			setDismissed({ dismissed: false });
			set({ isDismissed: false });
		},
	}),
);

/** Use this when you only need to show/dismiss without fetching progress data */
export const useOnboardingVisibility = () => useOnboardingDismissedStore();

export interface OnboardingProgress {
	/** Null until the first status is known — distinct from "nothing done yet",
	 * so the UI can hold rather than render a wrong zero. */
	completed: Record<OnboardingStepId, boolean> | null;
	currentStep: OnboardingStepId | null;
	completedCount: number;
	totalCount: number;
	allComplete: boolean;
	isDismissed: boolean;
	dismiss: () => void;
	show: () => void;
}

const toCompleted = (
	status: OnboardingStatus,
): Record<OnboardingStepId, boolean> => ({
	// The prompt resolves itself: the agent's first visible output is a catalog.
	prompt: status.catalog,
	catalog: status.catalog,
	customer: status.customer,
	// Unknown usage reads as incomplete for progress, but never overwrites a
	// cached true — see the merge below.
	usage: status.usage ?? false,
	deploy: status.deployed,
});

/** Analytics can time out; a step that was true must not flip back to false. */
const mergeStatus = ({
	fetched,
	cached,
}: {
	fetched: OnboardingStatus;
	cached: OnboardingStatus | null;
}): OnboardingStatus => ({
	...fetched,
	usage: fetched.usage ?? cached?.usage ?? null,
});

/**
 * One request for the whole checklist. Progress used to be derived from four
 * independent queries, so the count ticked upward on screen as each resolved;
 * the cached snapshot means a returning user's first paint is already right.
 */
export const useOnboardingProgress = (): OnboardingProgress => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const env = useEnv();
	const { isDismissed, dismiss, show } = useOnboardingDismissedStore();

	const cached = readSnapshot({ env });

	const { data: status } = useQuery<OnboardingStatus>({
		queryKey: buildKey(["onboarding-status"]),
		queryFn: async () => {
			const { data } = await axiosInstance.post<OnboardingStatus>(
				"/organization/onboardingStatus",
			);
			const merged = mergeStatus({ fetched: data, cached });
			writeSnapshot({ env, status: merged });
			return merged;
		},
		// Paints the last known state immediately, then reconciles in place.
		initialData: cached ?? undefined,
		refetchInterval: (query) =>
			query.state.data && !Object.values(query.state.data).includes(false)
				? false
				: REFETCH_INTERVAL,
	});

	const completed = status ? toCompleted(status) : null;
	const completedCount = completed
		? ONBOARDING_STEP_IDS.filter((id) => completed[id]).length
		: 0;

	return {
		completed,
		currentStep: completed
			? (ONBOARDING_STEP_IDS.find((id) => !completed[id]) ?? "deploy")
			: null,
		completedCount,
		totalCount: ONBOARDING_STEP_IDS.length,
		allComplete:
			Boolean(completed) && completedCount === ONBOARDING_STEP_IDS.length,
		isDismissed,
		dismiss,
		show,
	};
};
