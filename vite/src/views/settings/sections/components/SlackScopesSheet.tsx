import {
	ChatAuthMode,
	DEFAULT_OAUTH_RESOURCES,
	type ResourceType,
	type ScopeString,
} from "@autumn/shared";
import {
	Button,
	PanelButton,
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@autumn/ui";
import { GlobeIcon, LockIcon, UserIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { ScopeSelector } from "@/components/v2/scope-selector";

const BOT_RESOURCES = DEFAULT_OAUTH_RESOURCES as ResourceType[];

const TIERS: {
	mode: ChatAuthMode;
	label: string;
	description: string;
	icon: ReactNode;
}[] = [
	{
		mode: ChatAuthMode.PerUser,
		label: "Per-user",
		description:
			"Match each Slack user to their Autumn account and act with their own permissions.",
		icon: <UserIcon size={16} color="currentColor" />,
	},
	{
		mode: ChatAuthMode.Restricted,
		label: "Restricted",
		description:
			"Everyone shares the fixed set of scopes you pick below, regardless of who they are.",
		icon: <LockIcon size={16} color="currentColor" />,
	},
	{
		mode: ChatAuthMode.Unrestricted,
		label: "Unrestricted",
		description: "Everyone gets full admin access to the Autumn bot.",
		icon: <GlobeIcon size={16} color="currentColor" />,
	},
];

interface SlackScopesSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialMode?: ChatAuthMode | null;
	initialScopes?: ScopeString[];
	callerScopes: readonly string[];
	isReconnect: boolean;
	isSubmitting: boolean;
	onConfirm: (args: { mode: ChatAuthMode; scopes: ScopeString[] }) => void;
}

export const SlackScopesSheet = ({
	open,
	onOpenChange,
	initialMode,
	initialScopes,
	callerScopes,
	isReconnect,
	isSubmitting,
	onConfirm,
}: SlackScopesSheetProps) => {
	const [mode, setMode] = useState<ChatAuthMode>(
		initialMode ?? ChatAuthMode.PerUser,
	);
	const [scopes, setScopes] = useState<ScopeString[]>(initialScopes ?? []);

	useEffect(() => {
		if (open) {
			setMode(initialMode ?? ChatAuthMode.PerUser);
			setScopes(initialScopes ?? []);
		}
	}, [open, initialMode, initialScopes]);

	const isRestricted = mode === ChatAuthMode.Restricted;
	const confirmDisabled = isRestricted && scopes.length === 0;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="!w-[28rem] !max-w-[28rem] sm:!w-[28rem] sm:!max-w-[28rem]"
			>
				<SheetHeader>
					<SheetTitle>Slack bot permissions</SheetTitle>
					<p className="text-muted-foreground text-sm">
						Choose how the Autumn Slack bot decides what each user can access.
					</p>
				</SheetHeader>

				<div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
					<div className="flex flex-col gap-4">
						{TIERS.map((tier) => (
							<div key={tier.mode} className="flex w-full items-center gap-4">
								<PanelButton
									isSelected={mode === tier.mode}
									onClick={() => setMode(tier.mode)}
									icon={tier.icon}
								/>
								<div className="flex-1">
									<div className="text-body-highlight mb-1">{tier.label}</div>
									<div className="text-body-secondary leading-tight">
										{tier.description}
									</div>
								</div>
							</div>
						))}
					</div>

					{isRestricted && (
						<ScopeSelector
							value={scopes}
							onChange={setScopes}
							availableScopes={callerScopes}
							resources={BOT_RESOURCES}
							disabled={isSubmitting}
						/>
					)}
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
						onClick={() => onConfirm({ mode, scopes })}
						className="flex-1"
						isLoading={isSubmitting}
						disabled={confirmDisabled}
					>
						{isReconnect ? "Reconnect" : "Install in Slack"}
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
};
