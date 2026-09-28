import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { StripeKey } from "../../../../src/api/contract.ts";
import { useFullNukeKey } from "../../api/hooks.ts";
import { ErrorCallout } from "../../components/status.tsx";
import { Button, Dialog, Field } from "../../components/ui.tsx";

export const FullNukeDialog = ({
	stripeKey,
	onOpenChange,
}: {
	stripeKey: StripeKey | null;
	onOpenChange: (open: boolean) => void;
}) => {
	const fullNuke = useFullNukeKey();
	const [target, setTarget] = useState("2");
	const n = Number(target);
	const valid = Number.isInteger(n) && n >= 0 && n <= 50;
	const close = (open: boolean) => {
		onOpenChange(open);
		if (!open) {
			fullNuke.reset();
			setTarget("2");
		}
	};
	const submit = () =>
		stripeKey &&
		fullNuke.mutate(
			{ platformAccountId: stripeKey.platformAccountId, targetPerKey: n },
			{ onSuccess: () => close(false) },
		);
	return (
		<Dialog
			open={stripeKey !== null}
			onOpenChange={close}
			title="Full nuke this key?"
			description={
				stripeKey && (
					<span className="font-mono">
						{stripeKey.keyHint} · {stripeKey.platformAccountId}
					</span>
				)
			}
			footer={
				<>
					<Button variant="secondary" onClick={() => close(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						disabled={!valid}
						isLoading={fullNuke.isPending}
						onClick={submit}
					>
						Full nuke
					</Button>
				</>
			}
		>
			<form
				className="flex flex-col gap-3 text-sm text-tertiary-foreground"
				onSubmit={(e) => {
					e.preventDefault();
					if (valid) submit();
				}}
			>
				<ol className="list-decimal space-y-1.5 pl-4">
					<li>
						<span className="text-foreground">Delete everything.</span> Every
						connected account and every webhook endpoint on this key is deleted
						in Stripe, paced to stay within rate limits.
					</li>
					<li>
						<span className="text-foreground">Re-register.</span> One Connect
						webhook is registered again, pointed at{" "}
						<span className="font-mono">/ingress/connect/sandbox</span>.
					</li>
					<li>
						<span className="text-foreground">Top up.</span> Fresh clean
						accounts are created until this key holds {valid ? n : "N"}.
					</li>
				</ol>
				<Field
					label="Accounts after top-up"
					type="number"
					min={0}
					max={50}
					value={target}
					onChange={(e) => setTarget(e.target.value)}
					className="w-40"
					inputClassName="tabular-nums"
				/>
				<p className="flex items-start gap-2 text-xs">
					<ShieldAlert className="mt-px size-3.5 shrink-0 text-orange-600 dark:text-orange-400" />
					The key is marked unusable until it finishes, so no run can use it
					meanwhile. Other keys keep serving runs.
				</p>
				<ErrorCallout error={fullNuke.error} />
			</form>
		</Dialog>
	);
};
