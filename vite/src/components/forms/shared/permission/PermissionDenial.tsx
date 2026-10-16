import { Alert, AlertDescription, AlertTitle } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { ProhibitIcon } from "@phosphor-icons/react";
import { violationsInSection } from "./billingDenialSections";
import {
	formatAskRoles,
	formatDecidedBy,
	formatViolation,
} from "./formatDenial";
import { usePermissionDenial } from "./PermissionDenialContext";
import { useRoleName } from "./useRoleName";

/** A section's violations under its fields; `summary` adds the rule, its note and who can approve. */
export function PermissionDenial({
	section,
	className,
}: {
	section: string;
	className?: string;
}) {
	const resolved = usePermissionDenial();
	const roleName = useRoleName();
	if (!resolved) return null;

	const { denial, sections } = resolved;
	const violations = violationsInSection({ denial, section, sections }).map(
		(violation) => (
			<p
				key={violation.field}
				className="flex items-center gap-1.5 text-xs text-destructive dark:text-red-400"
			>
				<ProhibitIcon className="size-3.5 shrink-0" />
				{formatViolation({ violation })}
			</p>
		),
	);

	if (section !== "summary") {
		if (violations.length === 0) return null;
		return (
			<div className={cn("flex flex-col gap-1 px-4 pt-2", className)}>
				{violations}
			</div>
		);
	}

	return (
		<Alert variant="destructive" className={className}>
			<ProhibitIcon />
			<AlertTitle>{denial.decided_by.rule_name}</AlertTitle>
			<AlertDescription className="flex flex-col gap-1 [&_p:not(:last-child)]:mb-0">
				{violations}
				<p>{denial.message}</p>
				<p className="text-xs text-tertiary-foreground">
					{formatDecidedBy({ denial })}. {formatAskRoles({ denial, roleName })}.
				</p>
			</AlertDescription>
		</Alert>
	);
}
