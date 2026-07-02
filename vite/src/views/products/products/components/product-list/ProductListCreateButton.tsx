import { ProductCatalogType } from "@autumn/shared";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { cn } from "@/lib/utils";
import CreateProductSheet from "../CreateProductSheet";

export function ProductListCreateButton({ className }: { className?: string }) {
	const [createPlanOpen, setCreatePlanOpen] = useState(false);
	const [createLicenseOpen, setCreateLicenseOpen] = useState(false);

	useHotkeys(
		"n",
		(event) => {
			event.preventDefault();
			setCreatePlanOpen(true);
		},
		{ enableOnFormTags: false },
	);

	return (
		<>
			<CreateProductSheet
				open={createPlanOpen}
				onOpenChange={setCreatePlanOpen}
			/>
			<CreateProductSheet
				open={createLicenseOpen}
				onOpenChange={setCreateLicenseOpen}
				catalogType={ProductCatalogType.License}
			/>
			<div className="flex items-center">
				<Button
					variant="primary"
					size="default"
					onClick={() => setCreatePlanOpen(true)}
					className={cn("rounded-r-none", className)}
				>
					Create Plan
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="primary"
							size="default"
							className="rounded-l-none border-l-0 px-1.5"
							aria-label="More create options"
						>
							<CaretDownIcon className="size-3" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" sideOffset={4}>
						<DropdownMenuItem onClick={() => setCreateLicenseOpen(true)}>
							Create license
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}
