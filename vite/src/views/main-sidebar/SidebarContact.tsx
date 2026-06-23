"use client";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	LongInput,
} from "@autumn/ui";
import { ChatCircleTextIcon, QuestionIcon } from "@phosphor-icons/react";
import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import CopyButton from "@/components/general/CopyButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { useOnboardingVisibility } from "@/views/onboarding4/hooks/useOnboardingProgress";
import { NavButton } from "./NavButton";

export function SidebarContact() {
	const email = "hey@useautumn.com";
	const env = useEnv();
	const { show: showOnboardingGuide } = useOnboardingVisibility();
	const axiosInstance = useAxiosInstance({ env });
	const [feedbackOpen, setFeedbackOpen] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [loading, setLoading] = useState(false);

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
				<DropdownMenuTrigger render={<div />} nativeButton={false}>
					<NavButton
						env={env}
						icon={<QuestionIcon size={16} weight="duotone" />}
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
							<CopyButton
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
							We're online on Discord
							<span className="relative flex h-2 w-2">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
								<span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
							</span>
						</Link>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => setFeedbackOpen(true)}
						className="cursor-pointer"
					>
						<ChatCircleTextIcon size={14} weight="duotone" />
						Feedback
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={showOnboardingGuide}
						className="cursor-pointer"
					>
						<GraduationCap size={14} />
						Show onboarding guide
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
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
