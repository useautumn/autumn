import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_ROW_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import { COLLAPSE_VARIANTS } from "@/views/customers2/customer/customerAnimations";
import {
	type ConfigRowLayout,
	ConfigRowLayoutProvider,
	useConfigRowLayout,
} from "./advanced-section/ConfigRowLayoutContext";

const CONFIG_ROW_LAYOUT_CLASSES: Record<
	ConfigRowLayout,
	{
		root: string;
		header: string;
		label: string;
		description: string;
		body: string;
	}
> = {
	plain: {
		root: "flex flex-col",
		header: "flex items-center justify-between gap-3",
		label: "flex min-w-0 flex-col gap-px",
		description: "text-xs leading-snug text-tertiary-foreground/70",
		body: "flex flex-col gap-2 pt-2 empty:hidden",
	},
	tray: {
		root: cn("flex flex-col", TABLE_TRAY_SURFACE_ROW_CLASS),
		header: "flex min-h-11 items-center gap-3 px-3 py-[7px]",
		label: "flex min-w-0 flex-1 flex-col gap-0.5",
		description: "text-xs text-tertiary-foreground",
		body: "flex flex-col gap-2 px-3 pb-3 empty:hidden",
	},
};

/** Pass `expanded` to animate children in/out; omit it to render children statically. */
export function ConfigRow({
	title,
	description,
	action,
	children,
	expanded,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
	children?: ReactNode;
	expanded?: boolean;
}) {
	const classes = CONFIG_ROW_LAYOUT_CLASSES[useConfigRowLayout()];
	const body = (
		<ConfigRowLayoutProvider layout="plain">
			<div className={classes.body}>{children}</div>
		</ConfigRowLayoutProvider>
	);

	return (
		<div className={classes.root}>
			<div className={classes.header}>
				<div className={classes.label}>
					<span className="text-sm font-medium text-foreground">{title}</span>
					{description && (
						<span className={classes.description}>{description}</span>
					)}
				</div>
				{action && <div className="flex shrink-0">{action}</div>}
			</div>
			{expanded !== undefined ? (
				<AnimatePresence initial={false}>
					{expanded && children && (
						<motion.div
							variants={COLLAPSE_VARIANTS}
							initial="closed"
							animate="open"
							exit="closed"
							className="overflow-hidden"
						>
							{body}
						</motion.div>
					)}
				</AnimatePresence>
			) : (
				body
			)}
		</div>
	);
}
