import type { ApiByocCache } from "@autumn/shared";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Button,
	Skeleton,
} from "@autumn/ui";
import { useState } from "react";
import { useAtomQuery } from "@/hooks/queries/useAtomQuery";
import { getBackendErr } from "@/utils/genUtils";
import { SettingsSection } from "../SettingsSection";
import { AtomRemoval, AtomRemoved } from "./components/atom/AtomRemoval";
import { AtomSetupFlow } from "./components/atom/AtomSetupFlow";
import { AtomStatusChip } from "./components/atom/AtomStatusChip";
import { atomRemovalChip } from "./components/atom/atomDisplay";

/** Atoms that finish removing while this page is open stay as Removed until dismissed. */
const useRemovedAtomIds = (removing: ApiByocCache[]) => {
	const [seenIds, setSeenIds] = useState<string[]>([]);
	const [dismissedIds, setDismissedIds] = useState<string[]>([]);
	const removingIds = removing.map(({ id }) => id);
	const unseenIds = removingIds.filter((id) => !seenIds.includes(id));
	if (unseenIds.length) setSeenIds([...seenIds, ...unseenIds]);
	return {
		removedIds: seenIds.filter(
			(id) => !removingIds.includes(id) && !dismissedIds.includes(id),
		),
		dismiss: (id: string) => setDismissedIds([...dismissedIds, id]),
	};
};

const AtomContent = () => {
	const {
		cache,
		removing,
		stackName,
		stackNameSuffix,
		isLoading,
		error,
		refetch,
	} = useAtomQuery();
	const { removedIds, dismiss } = useRemovedAtomIds(removing);

	if (isLoading)
		return (
			<div className="flex flex-col gap-3" aria-busy="true">
				<Skeleton className="h-10 w-full" aria-label="Loading" />
				<Skeleton className="h-10 w-full" aria-label="Loading" />
			</div>
		);

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

	const hasPreviousAtoms = removing.length > 0 || removedIds.length > 0;
	return (
		<div className="flex flex-col gap-10">
			<AtomSetupFlow
				cache={cache}
				stackName={stackName}
				stackNameSuffix={stackNameSuffix}
			/>
			{hasPreviousAtoms && (
				<div className="flex flex-col gap-1">
					<Accordion type="multiple">
						{removing.map((removingCache) => (
							<AccordionItem key={removingCache.id} value={removingCache.id}>
								<AccordionTrigger className="items-center px-2 py-2">
									<span className="flex min-w-0 items-center gap-3">
										<span className="shrink-0 text-[15px] font-normal text-muted-foreground">
											Removing previous Atom
										</span>
										<span className="truncate font-mono text-xs font-normal text-subtle">
											{removingCache.stack_name}
										</span>
										<AtomStatusChip chip={atomRemovalChip(removingCache)} />
									</span>
								</AccordionTrigger>
								<AccordionContent className="pt-1 pb-0">
									<AtomRemoval cache={removingCache} />
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
					{removedIds.map((id) => (
						<AtomRemoved key={id} onDismiss={() => dismiss(id)} />
					))}
				</div>
			)}
		</div>
	);
};

export const AtomSection = () => (
	<SettingsSection
		title="Atom"
		badge="PREVIEW"
		description="Answer balance checks from your own cloud."
	>
		<AtomContent />
	</SettingsSection>
);
