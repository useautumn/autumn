import { useEffect } from "react";
import { useOnboardingStore } from "../store/useOnboardingStore";
import { OnboardingStep } from "../utils/onboardingUtils";
import { useOnboarding3QueryState } from "./useOnboarding3QueryState";

/**
 * One-way sync: query param → store
 * Query param is the source of truth
 */
export const useSyncPlaygroundMode = () => {
	const { queryStates, setQueryStates } = useOnboarding3QueryState();
	const setPlaygroundMode = useOnboardingStore((s) => s.setPlaygroundMode);

	const isPlaygroundStep = queryStates.step === OnboardingStep.Playground;

	// ONE-WAY sync: query param → store (only in playground step)
	useEffect(() => {
		if (isPlaygroundStep) {
			// Initialize m param if not present
			if (!queryStates.m) {
				setQueryStates({ m: "e" });
			} else if (queryStates.m === "e") {
				setPlaygroundMode("edit");
			} else if (queryStates.m === "p") {
				setPlaygroundMode("preview");
			}
		} else if (queryStates.m !== null) {
			// Remove 'm' param when not in playground step
			setQueryStates({ m: null });
		}
	}, [
		queryStates.m,
		queryStates.step,
		setPlaygroundMode,
		setQueryStates,
		isPlaygroundStep,
	]);
};
