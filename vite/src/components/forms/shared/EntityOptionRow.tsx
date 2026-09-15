import type { Entity } from "@autumn/shared";
import {
	CopyIconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { CheckIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "PENDING";
const ID_HEAD_LENGTH = 8;
const ID_TAIL_LENGTH = 4;
const TOOLTIP_DELAY_MS = 250;

/** Uuid-style ids share a head, so the tail is what tells rows apart. */
const truncateIdMiddle = (id: string): string => {
	if (id.length <= ID_HEAD_LENGTH + ID_TAIL_LENGTH + 1) return id;
	return `${id.slice(0, ID_HEAD_LENGTH)}…${id.slice(-ID_TAIL_LENGTH)}`;
};

const useIsClipped = () => {
	const ref = useRef<HTMLSpanElement>(null);
	const [isClipped, setIsClipped] = useState(false);

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const measure = () =>
			setIsClipped(element.scrollWidth > element.clientWidth);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	return { ref, isClipped };
};

/** Truncated text that only earns a tooltip once it is actually clipped. */
const ClippedText = ({
	value,
	className,
}: {
	value: string;
	className?: string;
}) => {
	const { ref, isClipped } = useIsClipped();
	return (
		<Tooltip disabled={!isClipped} delayDuration={TOOLTIP_DELAY_MS}>
			<TooltipTrigger asChild>
				<span ref={ref} className={cn("min-w-0 truncate", className)}>
					{value}
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs break-all">{value}</TooltipContent>
		</Tooltip>
	);
};

const REVEAL_ON_HOVER =
	"text-tertiary-foreground opacity-0 group-hover:opacity-100";

const CopyOnHover = ({ text }: { text: string }) => (
	<CopyIconButton
		text={text}
		size="sm"
		className={cn("h-5! w-5 shrink-0", REVEAL_ON_HOVER)}
	/>
);

const EntityIdTag = ({ id }: { id: string }) => {
	const shortened = truncateIdMiddle(id);
	return (
		<div className="group ml-auto flex shrink-0 items-center gap-1">
			<Tooltip disabled={shortened === id} delayDuration={TOOLTIP_DELAY_MS}>
				<TooltipTrigger asChild>
					<span className="font-mono text-xs text-tertiary-foreground">
						{shortened}
					</span>
				</TooltipTrigger>
				<TooltipContent className="max-w-xs break-all">{id}</TooltipContent>
			</Tooltip>
			<CopyOnHover text={id} />
		</div>
	);
};

/** Name reads in full, id sits right-aligned at a fixed length, copy on hover of either. */
export const EntityOptionRow = ({
	entity,
	isSelected,
}: {
	entity: Entity;
	isSelected: boolean;
}) => {
	const id = entity.id || PLACEHOLDER;
	return (
		<>
			<div className="flex flex-1 min-w-0 items-center gap-3">
				<div className="group flex min-w-0 items-center gap-1">
					{entity.name ? (
						<ClippedText value={entity.name} className="text-sm" />
					) : (
						<ClippedText
							value={id}
							className="font-mono text-xs text-tertiary-foreground"
						/>
					)}
					<CopyOnHover text={entity.name || id} />
				</div>
				{entity.name && <EntityIdTag id={id} />}
			</div>
			<div className="flex w-4 shrink-0 items-center justify-end">
				{isSelected && <CheckIcon className="size-4" />}
			</div>
		</>
	);
};
