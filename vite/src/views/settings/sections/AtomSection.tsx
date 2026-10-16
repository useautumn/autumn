import { Button, ConditionalTooltip, Skeleton } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect } from "react";
import { TABLE_TRAY_CLASS } from "@/components/general/table";
import { AtomScope } from "@/contexts/AtomApiContext";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { useAtomQuery } from "@/hooks/queries/useAtomQuery";
import { useAtomsQuery } from "@/hooks/queries/useAtomsQuery";
import { getBackendErr } from "@/utils/genUtils";
import { SettingsSection } from "../SettingsSection";
import { AtomList } from "./components/atom/AtomList";
import { AtomRemovalSheet } from "./components/atom/AtomRemovalSheet";
import { AtomSetupFlow } from "./components/atom/AtomSetupFlow";
import { AtomSteadyStateSkeleton } from "./components/atom/AtomSteadyState";
import { AtomSwitcher } from "./components/atom/AtomSwitcher";
import { isAtomBeingRemoved, isAtomSetUp } from "./components/atom/atomDisplay";

const ATOM_SECTION = {
	title: "Edge cache",
	badge: "PREVIEW",
	description: "Answer balance checks from your own cloud.",
};

/** The `atom` query param that opens a new Atom's setup rather than one of the env's Atoms. */
const NEW_ATOM = "new";

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

const AtomLoadError = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => (
	<div
		role="alert"
		className="flex flex-col items-start gap-3 rounded-lg border bg-card p-4"
	>
		<p className="text-sm text-tertiary-foreground">
			{getBackendErr(error, "We couldn't load your Atoms.")}
		</p>
		<Button variant="secondary" onClick={onRetry}>
			Try again
		</Button>
	</div>
);

/** One of the env's Atoms: its setup steps until it is set up, then its details and monitoring. */
const AtomContent = ({ onGone }: { onGone: () => void }) => {
	const { cache, stackName, stackNameSuffix, isLoading, error, refetch } =
		useAtomQuery();
	const [, setLastSeenSetUp] = useLastSeenAtomSetUp();
	const isSetUp = isAtomSetUp(cache);
	const isGone = !isLoading && !error && (!cache || isAtomBeingRemoved(cache));
	useEffect(() => {
		if (!isLoading && !error) setLastSeenSetUp(isSetUp);
	}, [isLoading, error, isSetUp]);
	useEffect(() => {
		if (isGone) onGone();
	}, [isGone]);

	if (isLoading || isGone) return <AtomBodySkeleton />;
	if (error) return <AtomLoadError error={error} onRetry={() => refetch()} />;
	return (
		<AtomSetupFlow
			cache={cache}
			stackName={stackName}
			stackNameSuffix={stackNameSuffix}
		/>
	);
};

/** The env's Atoms: a list, each one's own page with a switcher, and a new one's setup. */
export const AtomSection = () => {
	const [selected, setSelected] = useQueryState("atom", parseAsString);
	const {
		atoms,
		removing,
		nextStackName,
		nextStackNameSuffix,
		maxAtoms,
		isLoading,
		error,
		refetch,
	} = useAtomsQuery();
	const canCreate = atoms.length < maxAtoms;
	// The list is not polled once every Atom settles, so it is re-read on the way back to it.
	const showAll = () => {
		refetch();
		setSelected(null);
	};
	const open = (atomId: string) => {
		refetch();
		setSelected(atomId);
	};
	const create = () => setSelected(NEW_ATOM);

	const newAtomButton = (
		<ConditionalTooltip
			enabled={!canCreate}
			content={`This environment runs at most ${maxAtoms} Atom${maxAtoms === 1 ? "" : "s"}.`}
		>
			<span>
				<Button
					variant="primary"
					size="mini"
					disabled={!canCreate}
					onClick={create}
				>
					<PlusIcon className="size-3" />
					New Atom
				</Button>
			</span>
		</ConditionalTooltip>
	);

	const body = () => {
		if (isLoading) return <AtomBodySkeleton />;
		if (error) return <AtomLoadError error={error} onRetry={() => refetch()} />;
		if (selected === NEW_ATOM || atoms.length === 0)
			return (
				<AtomScope onCreated={open}>
					<AtomSetupFlow
						cache={null}
						stackName={nextStackName}
						stackNameSuffix={nextStackNameSuffix}
					/>
				</AtomScope>
			);
		if (selected)
			return (
				<AtomScope atomId={selected}>
					<AtomContent onGone={showAll} />
				</AtomScope>
			);
		return <AtomList atoms={atoms} maxAtoms={maxAtoms} onOpen={setSelected} />;
	};

	const isListing = !isLoading && !error && !selected && atoms.length > 0;
	return (
		<SettingsSection
			{...ATOM_SECTION}
			actions={
				<div className="flex items-center gap-2">
					<AtomRemovalSheet removing={removing} />
					{isListing && newAtomButton}
				</div>
			}
		>
			<div className="flex flex-col gap-4">
				{selected && atoms.length > 0 && (
					<AtomSwitcher
						atoms={atoms}
						selectedId={selected}
						canCreate={canCreate}
						onSelect={setSelected}
						onCreate={create}
						onShowAll={showAll}
					/>
				)}
				{body()}
			</div>
		</SettingsSection>
	);
};

/** The section as it loads, before the org it reads is known. */
export const AtomSectionSkeleton = () => (
	<SettingsSection {...ATOM_SECTION}>
		<AtomBodySkeleton />
	</SettingsSection>
);
