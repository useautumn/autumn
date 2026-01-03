import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { useSecretKeyStore } from "@/hooks/stores/useSecretKeyStore";
import type { Snippet } from "@/lib/snippets";

const SECRET_KEY_PLACEHOLDER = "sk_test_42424242";

interface SnippetCodeBlockProps {
	snippet: Snippet;
	codeOverride?: string;
}

export function SnippetCodeBlock({
	snippet,
	codeOverride,
}: SnippetCodeBlockProps) {
	const secretKey = useSecretKeyStore((s) => s.secretKey);
	const rawCode = codeOverride ?? snippet.code;

	// Replace placeholder with actual secret key if available
	const code = secretKey
		? rawCode.replace(new RegExp(SECRET_KEY_PLACEHOLDER, "g"), secretKey)
		: rawCode;

	return (
		<CodeGroup value={snippet.id}>
			<CodeGroupList>
				<CodeGroupTab value={snippet.id}>{snippet.filename}</CodeGroupTab>
				<CodeGroupCopyButton
					onCopy={() => navigator.clipboard.writeText(code)}
				/>
			</CodeGroupList>
			<CodeGroupContent value={snippet.id} copyText={code}>
				<CodeGroupCode language={snippet.language}>{code}</CodeGroupCode>
			</CodeGroupContent>
		</CodeGroup>
	);
}

