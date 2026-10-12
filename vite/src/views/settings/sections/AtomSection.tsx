import { Button, Skeleton } from "@autumn/ui";
import { useEffect } from "react";
import { TABLE_TRAY_CLASS } from "@/components/general/table";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { useAtomQuery } from "@/hooks/queries/useAtomQuery";
import { getBackendErr } from "@/utils/genUtils";
import { SettingsSection } from "../SettingsSection";
import { AtomRemovalSheet } from "./components/atom/AtomRemovalSheet";
import { AtomSetupFlow } from "./components/atom/AtomSetupFlow";
import { AtomSteadyStateSkeleton } from "./components/atom/AtomSteadyState";
import { isAtomSetUp } from "./components/atom/atomDisplay";

const ATOM_SECTION = {
	title: "Atom",
	badge: "PREVIEW",
	description: "Answer balance checks from your own cloud.",
};

/** Whether this browser last saw a set-up Atom, so a cold load draws the layout that is about to arrive. */
const useLastSeenAtomSetUp = () =>
	useLocalStorage("autumn.atom.lastSeenSetUp", true);

const AtomBodySkeleton = () => {
	const [wasSetUp] = useLastSeenAtomSetUp();
	if (wasSetUp) return <AtomSteadyStateSkeleton />;
	return (
		<div className={TABLE_TRAY_CLASS} aria-busy="true">
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-64 w-full" />
		</div>
	);
};

const AtomContent = () => {
	const { cache, stackName, stackNameSuffix, isLoading, error, refetch } =
		useAtomQuery();
	const [, setLastSeenSetUp] = useLastSeenAtomSetUp();
	const isSetUp = isAtomSetUp(cache);
	useEffect(() => {
		if (!isLoading && !error) setLastSeenSetUp(isSetUp);
	}, [isLoading, error, isSetUp]);

	if (isLoading) return <AtomBodySkeleton />;

	if (error)
		return (
			<div
				role="alert"
				className="flex flex-col items-start gap-3 rounded-lg border bg-card p-4"
			>
				<p className="text-sm text-tertiary-foreground">
					{getBackendErr(error, "We couldn't load your Atom.")}
				</p>
				<Button variant="secondary" onClick={() => refetch()}>
					Try again
				</Button>
			</div>
		);

	return (
		<AtomSetupFlow
			cache={cache}
			stackName={stackName}
			stackNameSuffix={stackNameSuffix}
		/>
	);
};

export const AtomSection = () => {
	const { removing } = useAtomQuery();
	return (
		<SettingsSection
			{...ATOM_SECTION}
			actions={<AtomRemovalSheet removing={removing} />}
		>
			<AtomContent />
		</SettingsSection>
	);
};

/** The section as it loads, before the org it reads is known. */
export const AtomSectionSkeleton = () => (
	<SettingsSection {...ATOM_SECTION}>
		<AtomBodySkeleton />
	</SettingsSection>
);
