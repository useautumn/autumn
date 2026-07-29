function InvoiceRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-2 font-mono text-[10px]">
			<span className="text-[#FFFFFF66]">{label}</span>
			<span className="text-[#E5E5E5]">{value}</span>
		</div>
	);
}

function SubscriptionCard() {
	return (
		<div className="flex flex-none flex-col overflow-hidden rounded-lg border border-[#9564ff4d] bg-[#9564ff14] sm:w-[206px]">
			<div className="flex items-baseline justify-between gap-2 border-[#9564ff26] border-b px-[11px] py-[9px]">
				<span className="font-mono text-[11px] text-[#E5E5E5]">
					subscription
				</span>
				<span className="font-mono text-[9px] text-[#9564ff]">monthly</span>
			</div>
			<div className="flex flex-1 flex-col gap-[5px] px-[11px] py-2.5">
				<div className="mb-px font-mono text-[9px] text-[#9564ff99] uppercase tracking-[0.08em]">
					invoice
				</div>
				<InvoiceRow label="docs · enterprise" value="$2,500" />
				<InvoiceRow label="api-ref · pro" value="$250" />
				<InvoiceRow label="credit overage" value="$240" />
			</div>
			<div className="flex justify-between gap-2 border-[#9564ff26] border-t px-[11px] py-[9px] font-mono text-[11px] text-[#E5E5E5]">
				<span>total</span>
				<span>$2,990</span>
			</div>
		</div>
	);
}

function CustomerBar() {
	return (
		<div className="flex h-11 items-center justify-between gap-3 rounded-lg border border-[#292929] bg-[#141414] px-3 py-[11px]">
			<span className="font-mono text-[11px] text-[#E5E5E5]">
				customer · acme
			</span>
			<span className="font-mono text-[10px] text-[#FFFFFF66]">
				100k <span className="text-[#9564ff]">pooled credits</span>
			</span>
		</div>
	);
}

function BranchConnector() {
	return (
		<>
			<div className="mx-auto block h-5 w-px bg-[#292929] sm:hidden" />
			<div className="relative hidden h-5 sm:block">
				<div className="absolute top-0 left-1/2 h-[9px] w-px bg-[#292929]" />
				<div className="absolute top-[9px] right-[16.6%] left-[16.6%] h-px bg-[#292929]" />
				<div className="absolute top-[9px] left-[16.6%] h-[11px] w-px bg-[#292929]" />
				<div className="absolute top-[9px] left-1/2 h-[11px] w-px bg-[#292929]" />
				<div className="absolute top-[9px] right-[16.6%] h-[11px] w-px bg-[#292929]" />
			</div>
		</>
	);
}

function DeploymentCard({
	name,
	tier,
	tierAccent,
	lines,
}: {
	name: string;
	tier: string;
	tierAccent?: boolean;
	lines: string[];
}) {
	return (
		<div className="rounded-lg border border-[#292929] bg-[#141414] p-[11px]">
			<div className="mb-2 flex items-baseline justify-between gap-1.5">
				<span className="font-mono text-[11px] text-[#E5E5E5]">{name}</span>
				<span
					className={`font-mono text-[9px] ${
						tierAccent ? "text-[#9564ff]" : "text-[#FFFFFF99]"
					}`}
				>
					{tier}
				</span>
			</div>
			<div className="font-mono text-[10px] text-[#FFFFFF66] leading-[1.7]">
				{lines.map((line, i) => (
					<div key={`${name}-${i}`}>{line}</div>
				))}
			</div>
		</div>
	);
}

export function HierarchyDiagram() {
	return (
		<div className="not-prose my-8 flex flex-col items-stretch gap-3 sm:flex-row">
			<SubscriptionCard />

			<div className="flex flex-none items-center justify-center font-mono text-[14px] text-[#3f3f3f] sm:h-11 sm:w-[22px]">
				<span className="rotate-90 sm:rotate-0">→</span>
			</div>

			<div className="min-w-0 flex-1">
				<CustomerBar />
				<BranchConnector />
				<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
					<DeploymentCard
						lines={["custom domain", "sso", "60k credits"]}
						name="docs"
						tier="enterprise"
						tierAccent
					/>
					<DeploymentCard
						lines={["analytics", "—", "30k credits"]}
						name="api-ref"
						tier="pro"
					/>
					<DeploymentCard
						lines={["—", "—", "10k credits"]}
						name="internal"
						tier="hobby"
					/>
				</div>
			</div>
		</div>
	);
}
