/** After a preview-only turn, nudge the model to call the write tool so the
 * harness suspends and surfaces an approval card instead of asking in prose. */
export const buildPreviewNudgeText = ({ toolName }: { toolName: string }) =>
	`Call the ${toolName} tool now with the exact args from your preview. It will pause for user approval automatically; do not ask for confirmation or repeat the summary.`;
