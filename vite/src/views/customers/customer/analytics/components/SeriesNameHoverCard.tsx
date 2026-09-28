import type { CustomerDisplayInfo, EntityDisplayInfo } from "@autumn/shared";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
	MiniCopyButton,
} from "@autumn/ui";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useAnalyticsContext } from "../AnalyticsContext";
import type { ChartSeriesConfig } from "../utils/transformGroupedChartData";
import { tooltipItemHref } from "./TooltipItem";

type SeriesSubject = {
	id: string;
	name?: string | null;
	email?: string | null;
};

const seriesSubject = ({
	series,
	customerNames,
	entityNames,
}: {
	series: ChartSeriesConfig;
	customerNames?: Record<string, CustomerDisplayInfo>;
	entityNames?: Record<string, EntityDisplayInfo>;
}): SeriesSubject | undefined => {
	if (series.customerId) {
		return { id: series.customerId, ...customerNames?.[series.customerId] };
	}
	if (series.entityId) {
		return { id: series.entityId, name: entityNames?.[series.entityId]?.name };
	}
	return undefined;
};

/** Wraps a customer or entity series name with a card showing who it is. */
export const SeriesNameHoverCard = ({
	series,
	children,
}: {
	series: ChartSeriesConfig;
	children: ReactNode;
}) => {
	const { customerNames, entityNames } = useAnalyticsContext();
	const subject = seriesSubject({ series, customerNames, entityNames });
	if (!subject) return children;

	const href = tooltipItemHref({
		item: { ...series, dataKey: series.yKey, value: 0, color: series.fill },
	});
	const label = series.customerId ? "customer" : "entity";

	return (
		<HoverCard>
			<HoverCardTrigger asChild closeDelay={0} delay={150}>
				<span className="min-w-0 cursor-default">{children}</span>
			</HoverCardTrigger>
			<HoverCardContent
				align="start"
				side="bottom"
				className="w-72 rounded-lg border-none bg-interactive-secondary p-3 shadow-md ring-1 ring-foreground/10"
			>
				<div className="flex flex-col gap-1.5 text-sm">
					<span className="truncate font-medium text-foreground">
						{subject.name || subject.email || subject.id}
					</span>
					{subject.name && subject.email && (
						<span className="truncate text-muted-foreground">
							{subject.email}
						</span>
					)}
					<MiniCopyButton text={subject.id} />
					{href && (
						<a
							href={href}
							target="_blank"
							rel="noopener"
							className="mt-1 flex w-fit items-center gap-1 text-tertiary-foreground hover:text-foreground"
						>
							View {label}
							<ArrowSquareOutIcon size={13} />
						</a>
					)}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
};
