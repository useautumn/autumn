import { type ApiByocCache, ByocCacheStatus } from "@autumn/shared";
import { useState } from "react";
import type { AtomSectionState } from "./AtomStepper";
import { hasAtomStack, isAtomConnected, isAtomSetUp } from "./atomDisplay";

type AtomEditableStep = "cloud" | "account";

const editableStepState = ({
	step,
	openStep,
	hasStack,
	isReached,
}: {
	step: AtomEditableStep;
	openStep: AtomEditableStep | null;
	hasStack: boolean;
	isReached: boolean;
}): AtomSectionState => {
	if (hasStack) return "locked";
	if (openStep === step) return "active";
	return isReached ? "done" : "upcoming";
};

const deployState = ({
	cache,
	openStep,
}: {
	cache: ApiByocCache | null;
	openStep: AtomEditableStep | null;
}): AtomSectionState => {
	if (!cache || openStep) return "upcoming";
	if (cache.status === ByocCacheStatus.Failed) return "failed";
	return isAtomConnected(cache) ? "done" : "active";
};

const verifyState = (cache: ApiByocCache | null): AtomSectionState =>
	cache?.status === ByocCacheStatus.Ready ? "active" : "upcoming";

export const useAtomSetupFlow = ({ cache }: { cache: ApiByocCache | null }) => {
	const [chosenStep, setOpenStep] = useState<AtomEditableStep | null>(null);
	const openStep = chosenStep ?? (cache ? null : "cloud");
	const hasStack = hasAtomStack(cache);
	const isAccountReached = cache !== null || openStep === "account";

	const verify = verifyState(cache);

	return {
		setOpenStep,
		isSetUp: isAtomSetUp(cache),
		hasStack,
		openStep: openStep ?? (verify === "active" ? "verify" : "deploy"),
		states: {
			cloud: editableStepState({
				step: "cloud",
				openStep,
				hasStack,
				isReached: true,
			}),
			account: editableStepState({
				step: "account",
				openStep,
				hasStack,
				isReached: isAccountReached,
			}),
			deploy: deployState({ cache, openStep }),
			verify,
		},
	};
};
