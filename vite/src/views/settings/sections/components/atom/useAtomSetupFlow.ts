import { type ApiByocCache, ByocCacheStatus } from "@autumn/shared";
import { useState } from "react";
import type { AtomSectionState } from "./AtomSetupSection";
import { hasAtomStack, isAtomConnected } from "./atomDisplay";

/** The steps a person edits before the stack exists; the rest follow alien. */
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

/** While the org edits its settings, the deploy waits on the new link. */
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

/** Which step is open and where every step stands; a page without an Atom always starts at cloud and size. */
export const useAtomSetupFlow = ({ cache }: { cache: ApiByocCache | null }) => {
	const [chosenStep, setOpenStep] = useState<AtomEditableStep | null>(null);
	const openStep = chosenStep ?? (cache ? null : "cloud");
	const hasStack = hasAtomStack(cache);
	const isAccountReached = cache !== null || openStep === "account";

	return {
		setOpenStep,
		hasStack,
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
			verify: verifyState(cache),
		},
	};
};
