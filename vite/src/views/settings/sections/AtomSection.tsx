import { Button, ConditionalTooltip } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { AtomScope } from "@/contexts/AtomApiContext";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { useAtomQuery } from "@/hooks/queries/useAtomQuery";
import { useAtomsQuery } from "@/hooks/queries/useAtomsQuery";
import { getBackendErr } from "@/utils/genUtils";
import { SettingsSection } from "../SettingsSection";
import { AtomList, AtomListSkeleton } from "./components/atom/AtomList";
import { AtomRemovalSheet } from "./components/atom/AtomRemovalSheet";
import {
	AtomSetupFlow,
	AtomSetupSkeleton,
} from "./components/atom/AtomSetupFlow";
import { AtomSteadyStateSkeleton } from "./components/atom/AtomSteadyState";
import { AtomBreadcrumb, type AtomView } from "./components/atom/AtomSwitcher";
import {
	atomCreateRefusal,
	isAtomBeingRemoved,
	isAtomSetUp,
} from "./components/atom/atomDisplay";
import { NEW_ATOM, useAtomSelection } from "./components/atom/useAtomSelection";

const ATOM_SECTION = {
	title: "Atom",
	badge: "PREVIEW",
	description: "Answer balance checks from your own cloud.",
};

/** Whether this browser last saw a set-up Atom, so a cold load draws the layout that is about to arrive. */
const useLastSeenAtomSetUp = () =>
	useLocalStorage("autumn.atom.lastSeenSetUp", true);

/** The view the URL and the list call for; with the list still loading and no Atom named, the list. */
const atomViewOf = ({
	selected,
	isLoading,
	atomCount,
}: {
	selected: string | null;
	isLoading: boolean;
	atomCount: number;
}): AtomView => {
	if (selected === NEW_ATOM) return "new";
	if (selected) return "detail";
	if (!isLoading && atomCount === 0) return "new";
	return "list";
};

/** The skeleton of the view about to render, in its own card, so it settles in place. */
const AtomViewSkeleton = ({
	view,
	isSetUp,
}: {
	view: AtomView;
	/** Known from the list once it loads; until then, what this browser last saw. */
	isSetUp?: boolean;
}) => {
	const [wasSetUp] = useLastSeenAtomSetUp();
	if (view === "list") return <AtomListSkeleton />;
	if (view === "new") return <AtomSetupSkeleton />;
	return (isSetUp ?? wasSetUp) ? (
		<AtomSteadyStateSkeleton />
	) : (
		<AtomSetupSkeleton />
	);
};

/** The section's frame in every view and while loading: a fixed-height actions slot, then the breadcrumb row, then the view. */
const AtomLayout = ({
	actions,
	breadcrumb,
	children,
}: {
	actions?: React.ReactNode;
	breadcrumb: React.ReactNode;
	children: React.ReactNode;
}) => (
	<SettingsSection
		{...ATOM_SECTION}
		actions={<div className="flex h-7 items-center gap-2">{actions}</div>}
	>
		<div className="flex flex-col gap-4">
			{breadcrumb}
			{children}
		</div>
	</SettingsSection>
);

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
const AtomContent = ({
	isSetUp: wasListedSetUp,
	onGone,
}: {
	isSetUp?: boolean;
	onGone: () => void;
}) => {
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

	if (isLoading || isGone)
		return <AtomViewSkeleton view="detail" isSetUp={wasListedSetUp} />;
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
	const selection = useAtomSelection();
	const { selected } = selection;
	const {
		atoms,
		removing,
		nextStackName,
		nextStackNameSuffix,
		limits,
		isLoading,
		error,
		refetch,
	} = useAtomsQuery();
	const view = atomViewOf({ selected, isLoading, atomCount: atoms.length });
	const canCreate = limits?.can_create ?? false;
	const refusal = limits && atomCreateRefusal(limits);
	// The list is not polled once every Atom settles, so it is re-read on the way back to it.
	const showAll = () => {
		refetch();
		selection.showAll();
	};
	const open = (atomId: string) => {
		refetch();
		selection.open(atomId);
	};
	const showCreated = (atomId: string) => {
		refetch();
		selection.replace(atomId);
	};
	const showAllAfterRemoval = () => {
		refetch();
		selection.replace(null);
	};
	const create = selection.create;

	const newAtomButton = (
		<ConditionalTooltip enabled={refusal !== null} content={refusal}>
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
		if (isLoading) return <AtomViewSkeleton view={view} />;
		if (error) return <AtomLoadError error={error} onRetry={() => refetch()} />;
		if (view === "new")
			return (
				<AtomScope onCreated={showCreated}>
					<AtomSetupFlow
						cache={null}
						stackName={nextStackName}
						stackNameSuffix={nextStackNameSuffix}
					/>
				</AtomScope>
			);
		if (view === "detail" && selected)
			return (
				<AtomScope atomId={selected}>
					<AtomContent
						isSetUp={isAtomSetUp(
							atoms.find(({ id }) => id === selected) ?? null,
						)}
						onGone={showAllAfterRemoval}
					/>
				</AtomScope>
			);
		return limits && <AtomList atoms={atoms} limits={limits} onOpen={open} />;
	};

	return (
		<AtomLayout
			actions={
				<>
					<AtomRemovalSheet removing={removing} />
					{view === "list" && !isLoading && !error && newAtomButton}
				</>
			}
			breadcrumb={
				<AtomBreadcrumb
					view={view}
					atoms={atoms}
					selectedId={selected}
					isLoading={isLoading}
					canCreate={canCreate}
					onSelect={open}
					onCreate={create}
					onShowAll={showAll}
				/>
			}
		>
			{body()}
		</AtomLayout>
	);
};

/** The section as it loads, before the org it reads is known: the frame and the skeleton of the view the URL asks for. */
export const AtomSectionSkeleton = () => {
	const { selected } = useAtomSelection();
	const view = atomViewOf({ selected, isLoading: true, atomCount: 0 });
	return (
		<AtomLayout
			breadcrumb={
				<AtomBreadcrumb
					view={view}
					atoms={[]}
					selectedId={selected}
					isLoading
					canCreate={false}
					onSelect={() => {}}
					onCreate={() => {}}
					onShowAll={() => {}}
				/>
			}
		>
			<AtomViewSkeleton view={view} />
		</AtomLayout>
	);
};
