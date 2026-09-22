import { InfoRow } from "@autumn/ui/components/general/info-row";
import { Badge } from "@autumn/ui/components/ui/badge";
import { Button } from "@autumn/ui/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@autumn/ui/components/ui/card";

export const cases = {
	buttons: (
		<div className="flex items-center gap-2">
			<Button variant="primary">Create plan</Button>
			<Button variant="secondary">Cancel</Button>
			<Button variant="muted">Duplicate</Button>
			<Button variant="destructive">Delete</Button>
			<Button variant="primary" isLoading>
				Saving
			</Button>
		</div>
	),
	"plan card": (
		<Card className="w-[360px]">
			<CardHeader>
				<CardTitle>Pro</CardTitle>
				<CardDescription>$49 / month, billed monthly</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				<InfoRow label="Customers" value="1,204" />
				<InfoRow label="Trial" value="14 days" />
				<InfoRow label="Status" value={<Badge variant="green">Live</Badge>} />
			</CardContent>
		</Card>
	),
};
