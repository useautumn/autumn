import {
	Button,
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import {
	type FormEvent,
	type ReactElement,
	type RefObject,
	useState,
} from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { useSlackInvite } from "../hooks/useSlackInvite";

const CHANNEL_PREFIX = "autumn-";
const INVALID_CHANNEL_NAME_CHARS = /[^a-z0-9_-]+/g;
const MAX_SUFFIX_LENGTH = 20;

const toChannelSuffix = (value: string) =>
	value
		.toLowerCase()
		.replace(INVALID_CHANNEL_NAME_CHARS, "-")
		.slice(0, MAX_SUFFIX_LENGTH);

type SlackChannelNamePopoverProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onRequested?: ({ email }: { email: string }) => void;
	side?: "top" | "bottom" | "left" | "right";
	align?: "start" | "center" | "end";
} & (
	| { trigger: ReactElement; anchor?: never }
	| { anchor: RefObject<HTMLElement | null>; trigger?: never }
);

/** Asks for the Slack channel name, prefilled from the org slug, then sends the invite. */
export function SlackChannelNamePopover({
	open,
	onOpenChange,
	onRequested,
	side = "bottom",
	align = "end",
	trigger,
	anchor,
}: SlackChannelNamePopoverProps) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			{trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
			<PopoverContent side={side} align={align} anchor={anchor}>
				<SlackChannelNameForm
					onRequested={(result) => {
						onOpenChange(false);
						onRequested?.(result);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}

// Mounted only while open, so the prefill picks up the org once it has loaded.
function SlackChannelNameForm({
	onRequested,
}: {
	onRequested: ({ email }: { email: string }) => void;
}) {
	const { org } = useOrg();
	const { requestInvite, isRequesting } = useSlackInvite();
	const [suffix, setSuffix] = useState(() => toChannelSuffix(org?.slug ?? ""));

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		if (!suffix) return;
		try {
			const result = await requestInvite({
				channelName: `${CHANNEL_PREFIX}${suffix}`,
			});
			onRequested(result);
		} catch {
			// The hook already surfaced the error.
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
			<div className="flex flex-col gap-1">
				<span className="font-medium text-foreground">Name your channel</span>
				<span className="text-xs text-tertiary-foreground">
					We'll create it in our Slack and email you an invite.
				</span>
			</div>
			<InputGroup>
				<InputGroupAddon className="pl-0">
					<InputGroupText className="font-normal text-tertiary-foreground">
						#{CHANNEL_PREFIX}
					</InputGroupText>
				</InputGroupAddon>
				<InputGroupInput
					autoFocus
					aria-label="Slack channel name"
					className="!pl-0"
					maxLength={MAX_SUFFIX_LENGTH}
					value={suffix}
					onChange={(event) => setSuffix(toChannelSuffix(event.target.value))}
				/>
			</InputGroup>
			<Button
				type="submit"
				variant="primary"
				size="sm"
				className="self-end"
				isLoading={isRequesting}
				disabled={!suffix}
			>
				Send invite
			</Button>
		</form>
	);
}
