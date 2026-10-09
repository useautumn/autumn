import type { ApiByocCache } from "@autumn/shared";
import { Button, CopyButton } from "@autumn/ui";
import { AtomFieldRow } from "./AtomFieldRow";
import { type AtomSectionState, AtomSetupSection } from "./AtomSetupSection";
import { AtomStatusChip } from "./AtomStatusChip";
import {
	ATOM_CONNECTED_CHIP,
	ATOM_CONNECTING_CHIP,
	ATOM_STAGE_STATUS_CHIPS,
	isAtomConnected,
} from "./atomDisplay";

/** Step 4: Atom runs, Autumn reaches it, and the app gets its URL. */
export const AtomVerifySection = ({
	cache,
	state,
	onDelete,
}: {
	cache: ApiByocCache;
	state: AtomSectionState;
	onDelete: () => void;
}) => {
	const isConnected = isAtomConnected(cache);

	return (
		<AtomSetupSection
			step={4}
			title="Verify"
			state={state}
			actions={
				<>
					<AtomStatusChip
						chip={isConnected ? ATOM_CONNECTED_CHIP : ATOM_CONNECTING_CHIP}
					/>
					<Button variant="secondary" size="mini" onClick={onDelete}>
						Delete
					</Button>
				</>
			}
		>
			<AtomFieldRow label="Atom" isMuted>
				<AtomStatusChip chip={ATOM_STAGE_STATUS_CHIPS[cache.stages.atom]} />
				<span className="text-tertiary-foreground">Health check passing</span>
			</AtomFieldRow>
			<AtomFieldRow label="Autumn" isMuted>
				<AtomStatusChip
					chip={isConnected ? ATOM_CONNECTED_CHIP : ATOM_CONNECTING_CHIP}
				/>
				<span className="text-tertiary-foreground">Autumn reaches Atom</span>
			</AtomFieldRow>
			{cache.endpoint_url && (
				<AtomFieldRow label="URL" isMuted>
					<CopyButton
						text={cache.endpoint_url}
						className="max-w-full font-mono text-xs"
					/>
				</AtomFieldRow>
			)}
		</AtomSetupSection>
	);
};
