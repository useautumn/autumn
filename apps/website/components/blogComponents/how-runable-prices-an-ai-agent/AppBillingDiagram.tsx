const APPS = [
	{
		name: "Bakery orders site",
		pricing: "Credits + subscriptions",
		payee: "bakery owner",
	},
	{
		name: "Fitness coaching app",
		pricing: "Subscriptions + trials",
		payee: "coach",
	},
	{ name: "Design agency portal", pricing: "Usage + top-ups", payee: "agency" },
] as const;

function Card({
	label,
	value,
	accent,
}: {
	label: string;
	value: string;
	accent?: boolean;
}) {
	return (
		<div
			className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 ${
				accent
					? "border-[#9564ff59] bg-[#9564ff1a]"
					: "border-[#2e2e2e] bg-[#191919]"
			}`}
		>
			<span
				className={`font-mono text-[10px] ${accent ? "text-[#9564ffcc]" : "text-[#FFFFFF66]"}`}
			>
				{label}
			</span>
			<span className="font-mono text-[12px] text-[#E5E5E5]">{value}</span>
		</div>
	);
}

function CompactRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-3 font-mono text-[10px]">
			<span className="text-[#FFFFFF66]">{label}</span>
			<span className="text-right text-[#E5E5E5]">{value}</span>
		</div>
	);
}

function CompactAppCard({
	name,
	pricing,
	payee,
}: {
	name: string;
	pricing: string;
	payee: string;
}) {
	return (
		<div className="overflow-hidden rounded-lg border border-[#2e2e2e] bg-[#191919]">
			<div className="border-[#2e2e2e] border-b px-3 py-2.5 font-mono text-[12px] text-[#E5E5E5]">
				{name}
			</div>
			<div className="flex flex-col gap-1.5 px-3 py-2.5">
				<div className="flex justify-between gap-3 font-mono text-[10px]">
					<span className="text-[#9564ffcc]">own Autumn org</span>
					<span className="text-right text-[#E5E5E5]">{pricing}</span>
				</div>
				<CompactRow label="own Stripe, via Connect" value={`$ → ${payee}`} />
			</div>
		</div>
	);
}

function Stem() {
	return <div className="mx-auto h-5 w-[1.5px] bg-[#3a3a3a]" />;
}

function ArrowHead({ className }: { className: string }) {
	return (
		<div
			className={`absolute bottom-0 size-0 -translate-x-1/2 border-x-[4.5px] border-t-[6px] border-x-transparent border-t-[#555555] ${className}`}
		/>
	);
}

// Column centers with a 16px gap: 1/6, 1/2 and 5/6 of the row, nudged by the gap.
const BRANCH_POINTS = [
	"left-[calc(16.667%-5.33px)]",
	"left-1/2",
	"left-[calc(83.333%+5.33px)]",
];

function BranchConnector() {
	return (
		<>
			<div className="mx-auto block h-6 w-[1.5px] bg-[#3a3a3a] sm:hidden" />
			<div aria-hidden="true" className="relative hidden h-11 sm:block">
				<div className="absolute top-0 left-1/2 h-[22px] w-[1.5px] -translate-x-1/2 bg-[#3a3a3a]" />
				<div className="absolute top-[22px] right-[calc(16.667%-5.33px)] left-[calc(16.667%-5.33px)] h-[1.5px] bg-[#3a3a3a]" />
				{BRANCH_POINTS.map((point) => (
					<div key={point}>
						<div
							className={`absolute top-[22px] h-4 w-[1.5px] -translate-x-1/2 bg-[#3a3a3a] ${point}`}
						/>
						<ArrowHead className={point} />
					</div>
				))}
			</div>
		</>
	);
}

export function AppBillingDiagram() {
	return (
		<div className="not-prose my-8 flex justify-center">
			<div className="w-full max-w-[688px]">
				<div className="mx-auto flex w-full max-w-[360px] flex-col gap-1.5 rounded-lg border border-[#2e2e2e] bg-[#191919] px-3.5 py-3">
					<div className="flex items-baseline justify-between gap-2">
						<span className="font-mono text-[12px] text-[#E5E5E5]">
							Runable agent
						</span>
						<span className="font-mono text-[10px] text-[#FFFFFF66]">
							sets up billing
						</span>
					</div>
					<span className="font-mono text-[10px] text-[#FFFFFF66]">
						Autumn CLI + Runable's skill → Platform API
					</span>
				</div>

				<BranchConnector />

				<div className="flex flex-col gap-3 sm:hidden">
					{APPS.map((app) => (
						<CompactAppCard key={app.name} {...app} />
					))}
				</div>

				<div className="hidden gap-4 pt-1 sm:flex">
					{APPS.map((app) => (
						<div key={app.name} className="flex flex-1 flex-col">
							<Card label="app" value={app.name} />
							<Stem />
							<Card accent label="own Autumn org" value={app.pricing} />
							<Stem />
							<Card
								label="own Stripe, via Connect"
								value={`$ → ${app.payee}`}
							/>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
