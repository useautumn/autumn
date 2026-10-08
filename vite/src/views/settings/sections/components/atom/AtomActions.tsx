import { type ApiByocCache, ByocCacheStatus } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { ATOM_STATUS_DISPLAY } from "./atomStatusDisplay";

export const AtomActions = ({
	cache,
	setupUrl,
	onGetSetupLink,
	isGettingSetupLink,
	onDelete,
}: {
	cache: ApiByocCache;
	setupUrl: string | null;
	onGetSetupLink: () => void;
	isGettingSetupLink: boolean;
	onDelete: () => void;
}) => {
	const isAwaitingSetup = cache.status === ByocCacheStatus.AwaitingSetup;
	const { removal } = ATOM_STATUS_DISPLAY[cache.status];

	return (
		<>
			{isAwaitingSetup && setupUrl && (
				<Button variant="primary" asChild>
					<a href={setupUrl} target="_blank" rel="noopener noreferrer">
						Open setup in AWS
					</a>
				</Button>
			)}
			{isAwaitingSetup && !setupUrl && (
				<Button
					variant="primary"
					onClick={onGetSetupLink}
					isLoading={isGettingSetupLink}
				>
					Get setup link
				</Button>
			)}
			<Button variant="destructive" onClick={onDelete}>
				{removal.action}
			</Button>
		</>
	);
};
