"use client";

import { ChatCircleTextIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { LongInput } from "@/components/v2/inputs/LongInput";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { NavButton } from "./NavButton";

export function FeedbackDialog() {
	const env = useEnv();
	const axiosInstance = useAxiosInstance({ env });
	const [open, setOpen] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async () => {
		if (!feedback.trim()) return;

		setLoading(true);
		try {
			await axiosInstance.post("/feedback", { feedback });

			toast.success("Thanks for your feedback!");
			setFeedback("");
			setOpen(false);
		} catch (error) {
			console.error("Failed to send feedback:", error);
			toast.error("Failed to send feedback");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<NavButton
				env={env}
				icon={<ChatCircleTextIcon size={16} weight="duotone" />}
				title="Feedback"
				isGroup
				onClick={() => setOpen(true)}
			/>
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
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleSubmit}
						isLoading={loading}
						disabled={!feedback.trim()}
					>
						Send Feedback
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
