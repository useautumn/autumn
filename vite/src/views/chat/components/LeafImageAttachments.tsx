import {
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputHeader,
	usePromptInputAttachments,
} from "@autumn/ui/ai-elements";

export function LeafImageAttachments() {
	const attachments = usePromptInputAttachments();
	if (attachments.files.length === 0) return null;

	return (
		<PromptInputHeader>
			<PromptInputAttachments className="gap-1.5 p-0">
				{(attachment) => <PromptInputAttachment data={attachment} />}
			</PromptInputAttachments>
		</PromptInputHeader>
	);
}
