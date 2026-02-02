import type { AgentPricingConfig } from "@autumn/shared";
import { ImageIcon } from "lucide-react";
import {
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputButton,
	PromptInputHeader,
	usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";

/**
 * Type for the build_pricing tool part returned by the AI
 */
export type BuildPricingToolPart = {
	type: "tool-build_pricing";
	toolCallId: string;
	toolName: "build_pricing";
	state:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error";
	input?: AgentPricingConfig;
	output?: unknown;
	errorText?: string;
};

/**
 * Preview org configuration for syncing pricing
 */
export interface PreviewOrg {
	apiKey: string;
	orgId: string;
	orgSlug: string;
}

/**
 * Button to open file dialog for image uploads in the chat input
 */
export function ImageUploadButton({ disabled }: { disabled?: boolean }) {
	const attachments = usePromptInputAttachments();

	return (
		<PromptInputButton
			onClick={() => attachments.openFileDialog()}
			disabled={disabled}
			title="Add image"
		>
			<ImageIcon className="size-4" />
		</PromptInputButton>
	);
}

/**
 * Header showing attached files in the prompt input
 */
export function AttachmentsHeader() {
	const attachments = usePromptInputAttachments();

	if (!attachments.files.length) {
		return null;
	}

	return (
		<PromptInputHeader>
			<PromptInputAttachments className="p-0 pt-2">
				{(attachment) => <PromptInputAttachment data={attachment} />}
			</PromptInputAttachments>
		</PromptInputHeader>
	);
}
