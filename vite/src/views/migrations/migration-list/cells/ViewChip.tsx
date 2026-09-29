import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
	StatusChip,
	StatusRing,
	type StatusTone,
} from "@autumn/ui";
import { overlaySurfaceClassName } from "@autumn/ui/lib/overlay-classes";
import type { ReactElement, ReactNode } from "react";
import type { ChipView } from "../rowView/chipView";

const Muted = ({ children }: { children: ReactNode }) => (
	<span className="shrink-0 font-[450] text-tertiary-foreground">
		{children}
	</span>
);

export function ViewChip({
	chip,
	ring,
}: {
	chip: ChipView;
	ring?: { tone: StatusTone; fraction: number };
}) {
	return (
		<StatusChip
			tone={chip.tile?.tone}
			glyph={chip.tile?.glyph}
			className={ring ? "pl-1" : undefined}
		>
			{ring && <StatusRing tone={ring.tone} fraction={ring.fraction} />}
			{chip.prefix && <Muted>{chip.prefix}</Muted>}
			<span className="min-w-0 truncate">{chip.label}</span>
			{chip.details?.map((detail) => (
				<span
					key={detail}
					className="min-w-0 shrink-[1000] truncate font-[450] text-tertiary-foreground"
				>
					{detail}
				</span>
			))}
		</StatusChip>
	);
}

export function CountChip({ count }: { count: number }) {
	return (
		<span className="inline-flex h-[22px] shrink-0 items-center rounded-md border border-black/6 px-1.5 text-xs leading-4 font-medium text-tertiary-foreground dark:border-white/6">
			+{count}
		</span>
	);
}

export function PopoverRow({
	label,
	children,
}: {
	label: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-[26px] items-center justify-between gap-3">
			<span className="shrink-0 text-xs text-tertiary-foreground">{label}</span>
			<div className="flex min-w-0 items-center gap-1">{children}</div>
		</div>
	);
}

export function PopoverHeading({
	title,
	subtitle,
}: {
	title: string;
	subtitle?: string;
}) {
	return (
		<div className="flex flex-col gap-2.5">
			<span className="text-[13px] leading-[18px] font-semibold text-foreground">
				{title}
			</span>
			{subtitle && (
				<span className="text-xs text-tertiary-foreground">{subtitle}</span>
			)}
		</div>
	);
}

export const PopoverSeparator = () => (
	<div className="h-px shrink-0 bg-overlay-separator preset:bg-border" />
);

/** Hover detail anchored under the hovered cell, never the whole row. */
export function CellHoverCard({
	trigger,
	children,
}: {
	trigger: ReactElement;
	children: ReactNode;
}) {
	return (
		<HoverCard>
			<HoverCardTrigger asChild delay={150} closeDelay={0}>
				{trigger}
			</HoverCardTrigger>
			<HoverCardContent
				side="bottom"
				align="start"
				sideOffset={10}
				className={`${overlaySurfaceClassName} flex w-80 flex-col gap-2.5 p-3 text-xs`}
			>
				{children}
			</HoverCardContent>
		</HoverCard>
	);
}
