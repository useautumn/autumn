import type { SetPlansErrorAction, SetPlansErrorCopy } from "@autumn/shared";
import { Alert, AlertDescription } from "@autumn/ui";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { SetPlansTextLine } from "@/components/forms/shared/errors/SetPlansTextLine";

/** Every Set Plans error: what's wrong on line 1, what to do on line 2. */
export function SetPlansErrorAlert({
	copy,
	onAction,
}: {
	copy: SetPlansErrorCopy;
	onAction?: (action: SetPlansErrorAction) => void;
}) {
	const { line, hint } = copy;
	const link = hint?.link;

	return (
		<Alert variant="destructive">
			<WarningCircleIcon weight="fill" aria-hidden />
			<AlertDescription>
				<p>
					<SetPlansTextLine parts={line} />
				</p>
				{hint && (
					<p className="text-tertiary-foreground">
						{link && (
							<>
								{onAction ? (
									<button
										type="button"
										onClick={() => onAction(link.action)}
										className="cursor-pointer font-medium text-foreground underline decoration-foreground/40 underline-offset-2 hover:decoration-foreground"
									>
										{link.label}
									</button>
								) : (
									link.label
								)}{" "}
							</>
						)}
						{hint.text}
					</p>
				)}
			</AlertDescription>
		</Alert>
	);
}
