import type { ApiByocCache } from "@autumn/shared";
import { Button, CopyButton } from "@autumn/ui";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { AtomFieldRow } from "./AtomFieldRow";
import { type AtomSectionState, AtomSetupSection } from "./AtomSetupSection";
import { AtomStatusChip } from "./AtomStatusChip";
import {
	ATOM_CONNECTED_CHIP,
	ATOM_CONNECTING_CHIP,
	ATOM_STAGE_STATUS_CHIPS,
	isAtomConnected,
} from "./atomDisplay";
import type { AtomActions } from "./useAtomActions";

/** The token is handed over once: shown while this page holds it, then only a new Atom has another. */
const AtomTokenValue = ({
	cache,
	revealToken,
}: {
	cache: ApiByocCache;
	revealToken: AtomActions["revealToken"];
}) => {
	const token = revealToken.data?.token;
	if (token)
		return (
			<>
				<CopyButton text={token} className="max-w-full font-mono text-xs" />
				<span className="text-xs text-subtle">Shown once</span>
			</>
		);
	if (cache.token_revealed)
		return <span className="text-tertiary-foreground">Already shown</span>;

	const reveal = () =>
		revealToken.mutate(undefined, {
			onError: (error) =>
				toast.error(getBackendErr(error, "Failed to show the token")),
		});
	return (
		<Button
			variant="secondary"
			size="mini"
			onClick={reveal}
			isLoading={revealToken.isPending}
		>
			Show token
		</Button>
	);
};

/** Step 4: Atom runs, Autumn reaches it, and the app gets its URL and token. */
export const AtomVerifySection = ({
	cache,
	state,
	revealToken,
	onDelete,
}: {
	cache: ApiByocCache;
	state: AtomSectionState;
	revealToken: AtomActions["revealToken"];
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
			<AtomFieldRow label="Token" isMuted>
				<AtomTokenValue cache={cache} revealToken={revealToken} />
			</AtomFieldRow>
		</AtomSetupSection>
	);
};
