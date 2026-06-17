import {
	LEAF_OAUTH_SCOPES,
	type ResourceType,
	type ScopeString,
} from "@autumn/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { ScopeSelector } from "@/components/v2/scope-selector";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/v2/sheets/Sheet";

// Resources the bot can be granted, derived from the leaf OAuth scope set.
const BOT_RESOURCES = [
	...new Set(LEAF_OAUTH_SCOPES.map((scope) => scope.split(":")[0])),
] as ResourceType[];

interface SlackScopesSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialScopes?: ScopeString[];
	callerScopes: readonly string[];
	isReconnect: boolean;
	isSubmitting: boolean;
	onConfirm: (scopes: ScopeString[]) => void;
}

export const SlackScopesSheet = ({
	open,
	onOpenChange,
	initialScopes,
	callerScopes,
	isReconnect,
	isSubmitting,
	onConfirm,
}: SlackScopesSheetProps) => {
	const [scopes, setScopes] = useState<ScopeString[]>(initialScopes ?? []);

	useEffect(() => {
		if (open) setScopes(initialScopes ?? []);
	}, [open, initialScopes]);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="!w-[28rem] !max-w-[28rem] sm:!w-[28rem] sm:!max-w-[28rem]"
			>
				<SheetHeader>
					<SheetTitle>Slack bot permissions</SheetTitle>
					<p className="text-muted-foreground text-sm">
						Choose what the Autumn Slack bot can access. Leave unrestricted for
						full access, or limit it to specific scopes.
					</p>
				</SheetHeader>

				<div className="overflow-y-auto px-4 pb-4">
					<ScopeSelector
						value={scopes}
						onChange={setScopes}
						availableScopes={callerScopes}
						resources={BOT_RESOURCES}
						disabled={isSubmitting}
					/>
				</div>

				<div className="flex gap-2 px-4 pt-2 pb-4">
					<Button
						variant="secondary"
						onClick={() => onOpenChange(false)}
						className="flex-1"
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={() => onConfirm(scopes)}
						className="flex-1"
						isLoading={isSubmitting}
					>
						{isReconnect ? "Reconnect" : "Install in Slack"}
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
};
