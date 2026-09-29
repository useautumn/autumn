import {
	type ChatTrustedBot,
	type ChatTrustedBotInput,
	MAX_CHAT_TRUSTED_BOTS,
	type Membership,
	SLACK_BOT_IDENTIFIER_REGEX,
} from "@autumn/shared";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	FormLabel,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import { SettingsListRow } from "../../components/SettingsListRow";

const toInput = ({
	slack_id,
	name,
	run_as_user_id,
}: ChatTrustedBot | ChatTrustedBotInput): ChatTrustedBotInput => ({
	slack_id,
	name,
	run_as_user_id,
});

const memberLabel = ({ user }: Membership) => user.name || user.email;

const AddTrustedBotDialog = ({
	open,
	onOpenChange,
	memberships,
	defaultRunAsUserId,
	existingSlackIds,
	isSaving,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	memberships: Membership[];
	defaultRunAsUserId?: string;
	existingSlackIds: Set<string>;
	isSaving: boolean;
	onSubmit: (bot: ChatTrustedBotInput) => void;
}) => {
	const [slackId, setSlackId] = useState("");
	const [name, setName] = useState("");
	const [runAsUserId, setRunAsUserId] = useState(defaultRunAsUserId ?? "");
	const [submitted, setSubmitted] = useState(false);

	const trimmedSlackId = slackId.trim().toUpperCase();
	const slackIdError = !SLACK_BOT_IDENTIFIER_REGEX.test(trimmedSlackId)
		? "Paste the bot's member ID (starts with U) or bot ID (starts with B)."
		: existingSlackIds.has(trimmedSlackId)
			? "This bot is already trusted."
			: undefined;
	const nameError = name.trim() ? undefined : "Give the bot a name.";
	const runAsError = runAsUserId ? undefined : "Pick a member to act as.";
	const isValid = !slackIdError && !nameError && !runAsError;

	const reset = () => {
		setSlackId("");
		setName("");
		setRunAsUserId(defaultRunAsUserId ?? "");
		setSubmitted(false);
	};

	const handleSubmit = () => {
		setSubmitted(true);
		if (!isValid) return;
		onSubmit({
			slack_id: trimmedSlackId,
			name: name.trim(),
			run_as_user_id: runAsUserId,
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Add trusted bot</DialogTitle>
					<DialogDescription>
						The agent will answer this bot's @-mentions like a teammate's, with
						the permissions of the member it acts as. Billing changes still need
						a person to approve.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div>
						<FormLabel>Slack ID</FormLabel>
						<Input
							placeholder="U0C5FGZPE7J"
							value={slackId}
							onChange={(event) => setSlackId(event.target.value)}
						/>
						<p className="mt-1.5 text-tertiary-foreground text-xs">
							In Slack, open the bot's profile and choose "Copy member ID".
						</p>
						{submitted && slackIdError && (
							<p className="mt-1 text-red-500 text-xs">{slackIdError}</p>
						)}
					</div>
					<div>
						<FormLabel>Name</FormLabel>
						<Input
							placeholder="Deals bot"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
						{submitted && nameError && (
							<p className="mt-1 text-red-500 text-xs">{nameError}</p>
						)}
					</div>
					<div>
						<FormLabel>Acts as</FormLabel>
						<Select value={runAsUserId} onValueChange={setRunAsUserId}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select a member" />
							</SelectTrigger>
							<SelectContent>
								{memberships.map((membership) => (
									<SelectItem
										key={membership.user.id}
										value={membership.user.id}
									>
										{memberLabel(membership)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{submitted && runAsError && (
							<p className="mt-1 text-red-500 text-xs">{runAsError}</p>
						)}
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="primary"
						className="w-full"
						onClick={handleSubmit}
						isLoading={isSaving}
					>
						Add bot
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

/** Other Slack apps whose @-mentions the agent answers, each acting as an org
 * member. */
export const TrustedBotsSettings = ({
	trustedBots,
}: {
	trustedBots: ChatTrustedBot[];
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const { memberships } = useMemberships();
	const [dialogOpen, setDialogOpen] = useState(false);

	const saveTrustedBots = useMutation({
		mutationFn: async (next: ChatTrustedBotInput[]) => {
			await OrgService.updateChatSettings(axiosInstance, "slack", {
				trusted_bots: next,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["chat"] });
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to update trusted bots"));
		},
	});

	const membersById = new Map(
		(memberships as Membership[]).map((membership) => [
			membership.user.id,
			membership,
		]),
	);
	const currentInputs = trustedBots.map(toInput);

	const addBot = (bot: ChatTrustedBotInput) =>
		saveTrustedBots.mutate([...currentInputs, bot], {
			onSuccess: () => {
				setDialogOpen(false);
				toast.success(`${bot.name} can now @-mention the agent`);
			},
		});

	const removeBot = (slackId: string) =>
		saveTrustedBots.mutate(
			currentInputs.filter((bot) => bot.slack_id !== slackId),
		);

	return (
		<>
			<SettingsListRow
				title="Trusted bots"
				description="Let other Slack apps @-mention the agent. Each acts as the member you pick."
			>
				<Button
					variant="secondary"
					onClick={() => setDialogOpen(true)}
					disabled={trustedBots.length >= MAX_CHAT_TRUSTED_BOTS}
				>
					Add bot
				</Button>
			</SettingsListRow>
			{trustedBots.map((bot) => {
				const runAs = membersById.get(bot.run_as_user_id);
				const isRemoving =
					saveTrustedBots.isPending &&
					!saveTrustedBots.variables?.some(
						(variable) => variable.slack_id === bot.slack_id,
					);
				return (
					<SettingsListRow
						key={bot.slack_id}
						title={bot.name}
						description={`${bot.slack_id} · acts as ${
							runAs ? memberLabel(runAs) : "a former member"
						}`}
					>
						<Button
							variant="secondary"
							onClick={() => removeBot(bot.slack_id)}
							isLoading={isRemoving}
							disabled={saveTrustedBots.isPending}
						>
							Remove
						</Button>
					</SettingsListRow>
				);
			})}
			<AddTrustedBotDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				memberships={memberships as Membership[]}
				defaultRunAsUserId={session?.user?.id}
				existingSlackIds={new Set(trustedBots.map((bot) => bot.slack_id))}
				isSaving={saveTrustedBots.isPending}
				onSubmit={addBot}
			/>
		</>
	);
};
