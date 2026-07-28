import {
	Badge,
	Button,
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
	Separator,
} from "@autumn/ui";
import { Fragment } from "react";

export type RateLimitOverrideEntry = {
	type: string;
	limit: number;
	defaultLimit: number | undefined;
};

export function RateLimitOverrideOrgCard({
	orgId,
	entries,
	onRemove,
}: {
	orgId: string;
	entries: RateLimitOverrideEntry[];
	onRemove: ({ orgId, type }: { orgId: string; type: string }) => void;
}) {
	const countLabel = entries.length === 1 ? "limit" : "limits";

	return (
		<Card className="gap-0 py-0">
			<CardHeader className="border-b py-3">
				<CardTitle className="truncate font-mono text-xs">{orgId}</CardTitle>
				<CardAction>
					<Badge variant="muted">
						{entries.length} {countLabel}
					</Badge>
				</CardAction>
			</CardHeader>
			<CardContent>
				{entries.map((entry, index) => (
					<Fragment key={entry.type}>
						{index > 0 && <Separator />}
						<div className="flex items-center justify-between gap-3 py-2">
							<div className="min-w-0">
								<div className="truncate font-mono text-[11px] text-muted-foreground">
									{entry.type}
								</div>
								<div className="text-xs tabular-nums text-muted-foreground">
									limit: {entry.limit}
									{entry.defaultLimit !== undefined && (
										<span className="ml-1 text-tertiary-foreground">
											(default {entry.defaultLimit})
										</span>
									)}
								</div>
							</div>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => onRemove({ orgId, type: entry.type })}
							>
								Remove
							</Button>
						</div>
					</Fragment>
				))}
			</CardContent>
		</Card>
	);
}
