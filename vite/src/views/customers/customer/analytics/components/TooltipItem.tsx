import { pushPage } from "@/utils/genUtils";
import { type TooltipEntry, tooltipItemLink } from "./tooltipItemLink";

/** Resolves a tooltip row's link against the current env and query params. */
export const tooltipItemHref = ({
	item,
}: {
	item: TooltipEntry;
}): string | undefined => {
	const link = tooltipItemLink({ item });
	return link ? pushPage(link) : undefined;
};

export function TooltipItem({
	item,
	label,
	href,
}: {
	item: TooltipEntry;
	label: string;
	href?: string;
}) {
	return (
		<div className="flex items-center gap-2">
			<span
				className="h-2.5 w-2.5 shrink-0 rounded-sm"
				style={{ background: item.color }}
			/>
			{href ? (
				<a
					href={href}
					target="_blank"
					rel="noopener"
					className="flex-1 truncate text-tertiary-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
				>
					{label}
				</a>
			) : (
				<span className="flex-1 truncate text-tertiary-foreground">
					{label}
				</span>
			)}
			<span className="tabular-nums text-muted-foreground">
				{Number(item.value).toLocaleString()}
			</span>
		</div>
	);
}
