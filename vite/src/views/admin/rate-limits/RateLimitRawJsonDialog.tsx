import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
import { TOUCH_TARGET_INPUT } from "./rateLimitTableStyles";
import type { RateLimitOverrideLimits } from "./rateLimitTypes";

/** The stored `orgs` config as JSON, for keys the table has no row for (e.g. auto_topup_attempts). */
export const RateLimitRawJsonDialog = ({
	open,
	onOpenChange,
	orgs,
	isSaving,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgs: RateLimitOverrideLimits;
	isSaving: boolean;
	onSave: (orgs: RateLimitOverrideLimits) => void;
}) => {
	const [jsonText, setJsonText] = useState("");

	useEffect(() => {
		if (open) setJsonText(JSON.stringify({ orgs }, null, 2));
	}, [open, orgs]);

	const parsed = parseOrgs({ jsonText });

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>Rate limit overrides JSON</DialogTitle>
				</DialogHeader>
				<div className="overflow-hidden rounded-md border">
					<Editor
						height="420px"
						language="json"
						value={jsonText}
						onChange={(value) => setJsonText(value ?? "")}
						options={{
							minimap: { enabled: false },
							scrollBeyondLastLine: false,
							fontSize: 12,
							tabSize: 2,
						}}
						theme="vs-dark"
					/>
				</div>
				{!parsed && (
					<p role="alert" className="text-xs text-destructive">
						Invalid JSON: expected{" "}
						{"{ orgs: { [org]: { limits, endpoints? } } }"}
					</p>
				)}
				<DialogFooter>
					<Button
						variant="secondary"
						className={TOUCH_TARGET_INPUT}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						className={TOUCH_TARGET_INPUT}
						isLoading={isSaving}
						disabled={!parsed}
						onClick={() => parsed && onSave(parsed)}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

const parseOrgs = ({
	jsonText,
}: {
	jsonText: string;
}): RateLimitOverrideLimits | null => {
	try {
		const { orgs } = JSON.parse(jsonText) as { orgs?: RateLimitOverrideLimits };
		return orgs && typeof orgs === "object" ? orgs : null;
	} catch {
		return null;
	}
};
