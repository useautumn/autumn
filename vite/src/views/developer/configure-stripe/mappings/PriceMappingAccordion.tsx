import { CaretRightIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import type { PriceMappingGroup, PriceMappingRow } from "./priceMappingRows";

const versionCountLabel = (count: number) =>
	`${count} ${count === 1 ? "price" : "prices"}`;

/** One plan's prices, collapsed to a summary line until opened. */
export const PriceMappingAccordion = ({
	group,
	summary,
	columns,
	renderRow,
	defaultOpen = false,
}: {
	group: PriceMappingGroup;
	summary: ReactNode;
	columns: string[];
	renderRow: (row: PriceMappingRow) => ReactNode;
	defaultOpen?: boolean;
}) => {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<div className="flex flex-col rounded-md border border-border">
			<button
				aria-expanded={open}
				className="group flex h-11 items-center gap-2 px-3 text-left text-sm"
				onClick={() => setOpen((value) => !value)}
				type="button"
			>
				<CaretRightIcon
					className={cn(
						"shrink-0 text-tertiary-foreground transition-transform duration-150 group-hover:text-foreground",
						open && "rotate-90",
					)}
					size={12}
				/>
				<span className="truncate font-medium">{group.planName}</span>
				<span className="shrink-0 text-tertiary-foreground text-xs">
					{versionCountLabel(group.rows.length)}
				</span>
				<span className="ml-auto flex min-w-0 shrink-0 items-center text-tertiary-foreground text-xs">
					{summary}
				</span>
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
					>
						<div className="flex flex-col gap-2 border-border border-t p-3">
							<div className="flex gap-2 text-tertiary-foreground text-tiny">
								{columns.map((column, index) => (
									<span
										className={cn(index === 0 ? "w-48 shrink-0" : "flex-1")}
										key={column}
									>
										{column}
									</span>
								))}
							</div>
							{group.rows.map((row) => (
								<div className="flex items-center gap-2" key={row.priceId}>
									<div className="flex w-48 shrink-0 flex-col">
										<span className="text-foreground text-sm">
											v{row.version}
										</span>
										<span className="line-clamp-2 text-tertiary-foreground text-xs">
											{row.label}
										</span>
									</div>
									{renderRow(row)}
								</div>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};
