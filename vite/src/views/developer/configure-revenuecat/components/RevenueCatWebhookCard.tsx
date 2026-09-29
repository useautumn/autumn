import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Skeleton,
	StatusChip,
	type StatusGlyph,
	type StatusTone,
} from "@autumn/ui";
import { useState } from "react";
import {
	CodeGroup,
	CodeGroupCodeSolidColour,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import {
	type RCWebhookStatus,
	useRCWebhook,
} from "@/hooks/queries/revcat/useRCWebhook";

const WEBHOOK_STATUS_INDICATORS: Record<
	RCWebhookStatus,
	{ label: string; tone: StatusTone; glyph: StatusGlyph }
> = {
	registered: { label: "Active", tone: "green", glyph: "check" },
	not_registered: { label: "Not set up", tone: "red", glyph: "x" },
	unknown: { label: "Can't verify", tone: "neutral", glyph: "alert" },
};

const WebhookCodeBlock = ({
	url,
	secret,
}: {
	url: string | null;
	secret: string | null;
}) => {
	const tabs = [
		url ? { value: "url", label: "Webhook URL", text: url } : null,
		secret ? { value: "secret", label: "Webhook Secret", text: secret } : null,
	].filter(
		(tab): tab is { value: string; label: string; text: string } => !!tab,
	);

	const [active, setActive] = useState(tabs[0]?.value ?? "url");

	if (tabs.length === 0) return null;
	const activeText = tabs.find((tab) => tab.value === active)?.text ?? "";

	return (
		<CodeGroup
			value={active}
			onValueChange={(value) => setActive(value as string)}
			className="min-w-0"
		>
			<CodeGroupList>
				{tabs.map((tab) => (
					<CodeGroupTab key={tab.value} value={tab.value}>
						{tab.label}
					</CodeGroupTab>
				))}
				<CodeGroupCopyButton
					className="h-full"
					onCopy={() => navigator.clipboard.writeText(activeText)}
				/>
			</CodeGroupList>
			{tabs.map((tab) => (
				<CodeGroupContent
					key={tab.value}
					value={tab.value}
					copyText={tab.text}
					className="p-2 border-t-0 overflow-x-auto"
				>
					<CodeGroupCodeSolidColour className="text-primary text-sm whitespace-pre-wrap break-all">
						{tab.text}
					</CodeGroupCodeSolidColour>
				</CodeGroupContent>
			))}
		</CodeGroup>
	);
};

export function RevenueCatWebhookCard() {
	const { status, url, secret, isLoading, register, isRegistering } =
		useRCWebhook();

	const { label, tone, glyph } = WEBHOOK_STATUS_INDICATORS[status];

	return (
		<Card className="shadow-none bg-interactive-secondary">
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle>Webhook</CardTitle>
					<StatusChip tone={tone} glyph={glyph}>
						{label}
					</StatusChip>
				</div>
				<CardDescription>
					RevenueCat sends purchase events here so Autumn can grant
					entitlements. Autumn registers this automatically.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isLoading ? (
					<Skeleton className="h-10 w-full" />
				) : (
					<>
						<div>
							<Button
								variant={status === "registered" ? "secondary" : "primary"}
								onClick={() => register()}
								isLoading={isRegistering}
							>
								{status === "registered" ? "Re-register" : "Register webhook"}
							</Button>
						</div>

						<div className="flex min-w-0 flex-col gap-3 border-t border-border/50 pt-3">
							<span className="text-tertiary-foreground text-sm">
								Or configure it manually in the RevenueCat console:
							</span>
							<WebhookCodeBlock url={url} secret={secret} />
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
