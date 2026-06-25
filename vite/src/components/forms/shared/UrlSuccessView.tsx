import { Button, CopyButton } from "@autumn/ui";
import { CheckCircleIcon } from "@phosphor-icons/react";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";

export function UrlSuccessView({
	title,
	description,
	message,
	buttonLabel,
	url,
}: {
	title: string;
	description: string;
	message: string;
	buttonLabel: string;
	url: string;
}) {
	return (
		<>
			<SheetHeader title={title} description={description} noSeparator />

			<SheetSection withSeparator={false}>
				<div className="flex flex-col items-center gap-2 pt-4">
					<div className="size-10 rounded-full bg-green-500/10 flex items-center justify-center">
						<CheckCircleIcon
							size={24}
							weight="duotone"
							className="text-green-500"
						/>
					</div>
					<p className="text-sm text-muted-foreground text-center">{message}</p>
				</div>
			</SheetSection>

			<SheetFooter className="flex flex-col grid-cols-1 mt-0">
				<Button
					variant="primary"
					className="w-full"
					onClick={() => window.open(url, "_blank")}
				>
					{buttonLabel}
				</Button>
				<CopyButton
					text={url}
					className="w-full"
					innerClassName="text-xs text-tertiary-foreground font-mono min-w-0 flex-1"
				/>
			</SheetFooter>
		</>
	);
}
