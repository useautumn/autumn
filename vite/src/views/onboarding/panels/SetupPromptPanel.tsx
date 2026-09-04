import { CopyButton } from "@autumn/ui";

export const SETUP_PROMPT =
	"Add Autumn billing to my app: useautumn.com/SKILL.md";

/** One line the user pastes into their coding agent — the agent fetches the URL
 * and gets the whole setup skill, so nothing long has to live in the dashboard. */
export function SetupPromptPanel() {
	return (
		<div className="flex items-center gap-2 rounded-lg border bg-interactive-secondary px-3 py-2">
			<code className="flex-1 min-w-0 truncate text-xs font-mono text-foreground">
				{SETUP_PROMPT}
			</code>
			<CopyButton
				text={SETUP_PROMPT}
				variant="secondary"
				size="sm"
				iconOrientation="left"
				className="gap-2 shrink-0"
			>
				Copy
			</CopyButton>
		</div>
	);
}
