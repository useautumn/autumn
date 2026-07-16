import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@autumn/ui/ai-elements";
import { ImageIcon } from "lucide-react";

export function LeafImageUploadButton() {
	const attachments = usePromptInputAttachments();

	return (
		<PromptInputButton
			aria-label="Add image"
			className="size-6 rounded-full text-tertiary-foreground"
			onClick={() => attachments.openFileDialog()}
			title="Add image"
		>
			<ImageIcon className="size-3.5" />
		</PromptInputButton>
	);
}
