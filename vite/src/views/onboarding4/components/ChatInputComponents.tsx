import type { AgentPricingConfig } from "@autumn/shared";
import {
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputButton,
	PromptInputHeader,
	usePromptInputAttachments,
} from "@autumn/ui/ai-elements";
import { ImageIcon } from "lucide-react";

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

export interface PreviewOrg {
	orgId: string;
	orgSlug: string;
}

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
