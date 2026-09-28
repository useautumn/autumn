"use client";

import {
	Button,
	CopyTextButton,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	LongInput,
} from "@autumn/ui";
import { ChatCircleTextIcon, DiscordLogoIcon } from "@phosphor-icons/react";
import { CircleQuestionMark, GraduationCap } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { pushPage } from "@/utils/genUtils";
import { useOnboardingVisibility } from "@/views/onboarding/hooks/useOnboardingProgress";
import { useSlackInvite } from "@/views/onboarding/hooks/useSlackInvite";
import { SlackChannelNamePopover } from "@/views/onboarding/panels/SlackChannelNamePopover";
import { SlackLogo } from "@/views/onboarding/panels/SlackInviteCard";
import { NavButton } from "./NavButton";

export function SidebarContact() {
	const email = "hey@useautumn.com";
	const env = useEnv();
	const navigate = useNavigate();
	const { show: showOnboardingGuide } = useOnboardingVisibility();
	const axiosInstance = useAxiosInstance({ env });
	const [feedbackOpen, setFeedbackOpen] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [loading, setLoading] = useState(false);
	const slackInvite = useSlackInvite();
	const [slackChannelOpen, setSlackChannelOpen] = useState(false);
	const contactButtonRef = useRef<HTMLDivElement>(null);

	const handleSubmitFeedback = async () => {
		if (!feedback.trim()) return;

		setLoading(true);
		try {
			await axiosInstance.post("/feedback", { feedback });
			toast.success("Thanks for your feedback!");
			setFeedback("");
			setFeedbackOpen(false);
		} catch (error) {
			console.error("Failed to send feedback:", error);
			toast.error("Failed to send feedback");
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<div ref={contactButtonRef} />}
					nativeButton={false}
				>
					<NavButton
						env={env}
						icon={<CircleQuestionMark strokeWidth={1.5} />}
						title="Contact us"
						onClick={() => {}}
						isGroup
					/>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="top" align="start">
					<span className="text-xs text-tertiary-foreground p-2">
						👋 We respond within 30 minutes
					</span>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => {
							window.location.href = `mailto:${email}`;
						}}
						className="cursor-pointer"
					>
						<div className="flex items-center justify-between w-full">
							<span>hey@useautumn.com</span>
							<CopyTextButton
								text={email}
								className="bg-transparent shadow-none hover:bg-zinc-200 w-6 gap-0 h-6 !px-0 py-0 flex items-center justify-center text-muted-foreground"
							/>
						</div>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => window.open("https://cal.com/ayrod", "_blank")}
						className="cursor-pointer"
					>
						Book a call
					</DropdownMenuItem>
					<DropdownMenuItem
						className="cursor-pointer h-[30px] flex justify-start"
						asChild
					>
						<Link to="https://discord.gg/STqxY92zuS" target="_blank">
							<DiscordLogoIcon size={14} weight="fill" color="#5865F2" />
							Join our Discord
						</Link>
					</DropdownMenuItem>
					{slackInvite.isReady && (
						<DropdownMenuItem
							onClick={() => setSlackChannelOpen(true)}
							className="cursor-pointer"
						>
							<SlackLogo className="size-3.5" />
							Join a Slack channel
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => setFeedbackOpen(true)}
						className="cursor-pointer"
					>
						<ChatCircleTextIcon size={14} weight="duotone" />
						Feedback
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => {
							showOnboardingGuide();
							pushPage({
								path: "/onboarding",
								navigate,
								preserveParams: false,
							});
						}}
						className="cursor-pointer"
					>
						<GraduationCap size={14} />
						Show onboarding guide
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<SlackChannelNamePopover
				open={slackChannelOpen}
				onOpenChange={setSlackChannelOpen}
				anchor={contactButtonRef}
				side="right"
				align="end"
				onRequested={({ email }) =>
					toast.success(`Slack invite sent to ${email}. Check your inbox.`)
				}
			/>
			<Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Help us improve</DialogTitle>
						<DialogDescription>
							We read every comment, and often turn around features within a
							couple days. Be as brutal as you can - thank you so much!
						</DialogDescription>
					</DialogHeader>
					<LongInput
						value={feedback}
						onChange={(e) => setFeedback(e.target.value)}
						placeholder={`The worst part about Autumn is...\n\nI really wish Autumn had....\n\nThe part I found most confusing was...`}
						className="min-h-[120px]"
					/>
					<DialogFooter>
						<Button variant="secondary" onClick={() => setFeedbackOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="primary"
							onClick={handleSubmitFeedback}
							isLoading={loading}
							disabled={!feedback.trim()}
						>
							Send Feedback
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
