import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { cn } from "@/lib/utils";

export function PlanVersionConfigRow({
	description,
	numVersions,
	version,
	onVersionChange,
}: {
	description: string;
	numVersions: number;
	version: number;
	onVersionChange: (version: number) => void;
}) {
	const [open, setOpen] = useState(false);
	const versions = Array.from(
		{ length: numVersions },
		(_, index) => numVersions - index,
	);

	return (
		<ConfigRow
			title="Plan Version"
			description={description}
			action={
				<DropdownMenu open={open} onOpenChange={setOpen}>
					<DropdownMenuTrigger
						render={
							<Button
								variant="secondary"
								size="mini"
								className={cn("gap-1", open && "btn-secondary-active")}
							/>
						}
					>
						Version {version}
						<CaretDownIcon className="size-3.5 text-tertiary-foreground" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{versions.map((option) => (
							<DropdownMenuItem
								key={option}
								onClick={() => {
									if (option !== version) onVersionChange(option);
								}}
								className="flex gap-3"
							>
								<CheckIcon
									size={12}
									className={option === version ? "opacity-100" : "opacity-0"}
								/>
								Version {option}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			}
		/>
	);
}
