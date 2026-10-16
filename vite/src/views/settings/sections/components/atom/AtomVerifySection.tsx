import type { ApiByocCache } from "@autumn/shared";
import { Button, CopyButton, Skeleton } from "@autumn/ui";
import { useAtomChecksQuery } from "@/hooks/queries/useAtomChecksQuery";
import { AtomFieldRow } from "./AtomFieldRow";
import { AtomFirstChecks } from "./AtomFirstChecks";
import { AtomSetupSection } from "./AtomSetupSection";
import { AtomStatusChip } from "./AtomStatusChip";
import {
	ATOM_CONNECTED_CHIP,
	ATOM_CONNECTING_CHIP,
	ATOM_RECEIVING_CHECKS_CHIP,
	ATOM_STAGE_STATUS_CHIPS,
	isAtomConnected,
} from "./atomDisplay";

/** Step 4: Atom runs, Autumn reaches it, and the org's app sends its first checks; setup can finish once Atom is connected, checks or not. */
export const AtomVerifySection = ({
	cache,
	onDelete,
	onFinish,
	isFinishing,
}: {
	cache: ApiByocCache;
	onDelete: () => void;
	onFinish: () => void;
	isFinishing: boolean;
}) => {
	const isConnected = isAtomConnected(cache);
	const { firstCheckSeenAt, checks } = useAtomChecksQuery({
		enabled: isConnected,
	});
	const hasChecks = firstCheckSeenAt !== null;
	const connectionChip = isConnected
		? ATOM_CONNECTED_CHIP
		: ATOM_CONNECTING_CHIP;

	return (
		<AtomSetupSection
			status={
				<AtomStatusChip
					chip={hasChecks ? ATOM_RECEIVING_CHECKS_CHIP : connectionChip}
				/>
			}
			actions={
				<>
					<Button variant="secondary" onClick={onDelete}>
						Delete
					</Button>
					<Button
						variant="primary"
						onClick={onFinish}
						disabled={!isConnected}
						isLoading={isFinishing}
					>
						Finish setup
					</Button>
				</>
			}
		>
			<AtomFieldRow label="Atom" isMuted>
				<AtomStatusChip chip={ATOM_STAGE_STATUS_CHIPS[cache.stages.atom]} />
				<span className="text-tertiary-foreground">Health check passing</span>
			</AtomFieldRow>
			<AtomFieldRow label="Autumn" isMuted>
				<AtomStatusChip chip={connectionChip} />
				<span className="text-tertiary-foreground">Atom reports in</span>
			</AtomFieldRow>
			<AtomFieldRow label="URL" isMuted>
				{cache.endpoint_url ? (
					<CopyButton
						text={cache.endpoint_url}
						className="max-w-full font-mono text-xs"
					/>
				) : (
					<Skeleton className="h-6 w-64" />
				)}
			</AtomFieldRow>
			<AtomFirstChecks
				endpointUrl={cache.endpoint_url}
				isConnected={isConnected}
				firstCheckSeenAt={firstCheckSeenAt}
				checks={checks}
			/>
		</AtomSetupSection>
	);
};
