import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@autumn/ui";
import { useMemo } from "react";
import {
	CodeGroup,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { VirtualizedJson } from "@/components/v2/VirtualizedJson";

/** Read-only, syntax-highlighted JSON in a sheet — used for the approval's raw
 * payload and write-tool parameters. */
export function JsonSheet({
	onOpenChange,
	open,
	title,
	value,
}: {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	title: string;
	value: unknown;
}) {
	const json = useMemo(() => JSON.stringify(value, null, 2), [value]);
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden bg-background sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
				</SheetHeader>
				<div className="flex h-0 flex-1 flex-col px-4 pb-4">
					<CodeGroup className="flex h-0 flex-1 flex-col" value="json">
						<CodeGroupList>
							<CodeGroupTab value="json">JSON</CodeGroupTab>
							<CodeGroupCopyButton
								onCopy={() => navigator.clipboard.writeText(json)}
							/>
						</CodeGroupList>
						<VirtualizedJson
							className="h-0 flex-1 rounded-b-lg border border-t-0 bg-white py-4 dark:bg-background"
							json={json}
						/>
					</CodeGroup>
				</div>
			</SheetContent>
		</Sheet>
	);
}
