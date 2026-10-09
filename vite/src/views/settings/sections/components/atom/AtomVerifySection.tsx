import type { ApiByocCache } from "@autumn/shared";
import { Button, CopyButton } from "@autumn/ui";
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

/** Step 4: Atom runs, Autumn reaches it, and the org's app sends its first checks. */
export const AtomVerifySection = ({
	cache,
	onDelete,
	onFinish,
}: {
	cache: ApiByocCache;
	onDelete: () => void;
	onFinish: () => void;
}) => {
	const isConnected = isAtomConnected(cache);
	const { checks } = useAtomChecksQuery({ enabled: isConnected });
	const hasChecks = checks.length > 0;
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
					{hasChecks && (
						<Button variant="primary" onClick={onFinish}>
							Finish setup
						</Button>
					)}
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
			{cache.endpoint_url && (
				<AtomFieldRow label="URL" isMuted>
					<CopyButton
						text={cache.endpoint_url}
						className="max-w-full font-mono text-xs"
					/>
				</AtomFieldRow>
			)}
			{isConnected && cache.endpoint_url && (
				<AtomFirstChecks endpointUrl={cache.endpoint_url} checks={checks} />
			)}
		</AtomSetupSection>
	);
};
