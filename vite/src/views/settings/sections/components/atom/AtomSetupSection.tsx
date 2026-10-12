import {
	TABLE_TRAY_FOOTER_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";

/** The open step's rows on the tray's surface, an optional note under them, its status on the left of the footer and its buttons on the right. */
export const AtomSetupSection = ({
	status,
	actions,
	note,
	children,
}: {
	status?: React.ReactNode;
	actions?: React.ReactNode;
	note?: React.ReactNode;
	children?: React.ReactNode;
}) => (
	<>
		{children && <div className={TABLE_TRAY_SURFACE_CLASS}>{children}</div>}
		{note && (
			<div className="flex flex-col gap-1 px-3 pt-3 pb-1 text-pretty text-xs text-tertiary-foreground">
				{note}
			</div>
		)}
		{(status || actions) && (
			<div className={TABLE_TRAY_FOOTER_CLASS}>
				<div className="flex items-center gap-2">{status}</div>
				<div className="flex items-center gap-2">{actions}</div>
			</div>
		)}
	</>
);
