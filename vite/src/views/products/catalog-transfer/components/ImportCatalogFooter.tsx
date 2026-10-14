import { Button } from "@autumn/ui";
import {
	CheckCircleIcon,
	InfoIcon,
	LockSimpleIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";

export function ImportBlockedBanner() {
	return (
		<div
			role="alert"
			className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5"
		>
			<LockSimpleIcon
				size={15}
				className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
			/>
			<div className="flex flex-col gap-0.5">
				<span className="font-medium text-amber-600 text-sm dark:text-amber-400">
					Import is disabled in production.
				</span>
				<span className="text-foreground text-xs">
					Use it on a local or staging dashboard. Export catalog still works
					here.
				</span>
			</div>
		</div>
	);
}

const footerNote = ({
	blocked,
	error,
	hasPreview,
}: {
	blocked: boolean;
	error: string | null;
	hasPreview: boolean;
}) => {
	if (blocked)
		return {
			icon: <InfoIcon size={13} />,
			text: "Disabled on app.useautumn.com",
		};
	if (error)
		return {
			icon: <WarningCircleIcon size={13} className="text-destructive" />,
			text: error,
		};
	if (hasPreview)
		return {
			icon: <CheckCircleIcon size={13} className="text-green-500" />,
			text: "Preview matches the JSON above.",
		};
	return {
		icon: <InfoIcon size={13} />,
		text: "Nothing is written until you Apply.",
	};
};

export function ImportCatalogFooter({
	blocked,
	error,
	hasPreview,
	canPreview,
	isPreviewing,
	isApplying,
	onCancel,
	onPreview,
	onApply,
}: {
	blocked: boolean;
	error: string | null;
	hasPreview: boolean;
	canPreview: boolean;
	isPreviewing: boolean;
	isApplying: boolean;
	onCancel: () => void;
	onPreview: () => void;
	onApply: () => void;
}) {
	const note = footerNote({ blocked, error, hasPreview });
	return (
		<div className="flex items-center gap-2 pt-1">
			<span
				className="flex min-w-0 flex-1 items-center gap-1.5 text-tertiary-foreground text-xs"
				title={note.text}
			>
				<span className="shrink-0">{note.icon}</span>
				<span className="truncate">{note.text}</span>
			</span>
			<Button variant="secondary" onClick={onCancel}>
				Cancel
			</Button>
			<Button
				variant="secondary"
				disabled={blocked || !canPreview}
				isLoading={isPreviewing}
				onClick={onPreview}
			>
				{hasPreview ? "Preview again" : "Preview"}
			</Button>
			<Button
				variant="primary"
				disabled={blocked || !hasPreview}
				isLoading={isApplying}
				onClick={onApply}
			>
				{hasPreview ? "Apply changes" : "Apply"}
			</Button>
		</div>
	);
}
