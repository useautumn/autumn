import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_ROW_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import {
	type ConfigRowLayout,
	ConfigRowLayoutProvider,
	useConfigRowLayout,
} from "./advanced-section/ConfigRowLayoutContext";

const EXPAND_TRANSITION = {
	duration: 0.2,
	ease: [0.32, 0.72, 0, 1] as const,
};

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
		root: "flex flex-col gap-2",
		header: "flex items-center justify-between gap-3",
		label: "flex min-w-0 flex-col gap-px",
		description: "text-xs leading-snug text-tertiary-foreground/70",
		body: "flex flex-col gap-2 empty:hidden",
	},
	tray: {
		root: cn("flex flex-col", TABLE_TRAY_SURFACE_ROW_CLASS),
		header: "flex min-h-11 items-center gap-3 px-3 py-[7px]",
		label: "flex min-w-0 flex-1 flex-col gap-0.5",
		description: "text-xs text-tertiary-foreground",
		body: "flex flex-col gap-2 px-3 pb-3 empty:hidden",
	},
};

/**
 * Label + control row used across plan config and advanced sections; renders as a tray row inside AdvancedTray.
 * Pass `expanded` to animate children in/out; omit it to render children statically.
 */
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
							initial={{ height: 0, opacity: 0 }}
							animate={{
								height: "auto",
								opacity: 1,
								transition: {
									height: EXPAND_TRANSITION,
									opacity: { duration: 0.15, delay: 0.05 },
								},
							}}
							exit={{
								height: 0,
								opacity: 0,
								transition: EXPAND_TRANSITION,
							}}
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
