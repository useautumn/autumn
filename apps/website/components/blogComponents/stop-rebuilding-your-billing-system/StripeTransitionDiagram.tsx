"use client";

import { useReducedMotion } from "motion/react";
import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
	Connector,
	DiagramCanvas,
	IconBranch,
	IconCode,
	IconDoc,
	NodeCard,
} from "./diagramShared";
import { TogglePill } from "./shared";

const W = 660;
const H = 360;

const OPS = [
	{ title: "Switch plan", sub: "subscription.update" },
	{ title: "Future change", sub: "schedules.create" },
	{ title: "Custom contract", sub: "prices.create" },
	{ title: "Usage add-on", sub: "subItems.update" },
];

const SCENARIOS = [
	{ label: "Upgrade", op: 0 },
	{ label: "Deferred", op: 1 },
	{ label: "Custom", op: 2 },
	{ label: "Add-on", op: 3 },
];

const SNIPPETS = [
	'stripe.subscriptions.update(sub, {\n  items: [{ id: oldItem, deleted: true }, { price: "price_pro_v2" }],\n});',
	'stripe.subscriptionSchedules.create({\n  phases: [{ items: [{ price: "price_pro_v2" }] }],\n});',
	"const price = await stripe.prices.create({ ... });\nstripe.subscriptions.update(sub, { items: [{ price: price.id }] });",
	"stripe.subscriptionItems.update(item, { quantity });",
];

const OP_W = 200;
const OP_H = 54;
const OP_X = 444;
const OP_Y = [22, 104, 186, 268];

const COND = { x: 250, y: 142, w: 120, h: 76 };
const CURRENT = { x: 16, y: 70, w: 150, h: 54 };
const NEXT = { x: 16, y: 236, w: 150, h: 54 };

export function StripeTransitionDiagram() {
	const [scenario, setScenario] = useState(0);
	const reduce = useReducedMotion();
	const activeOp = SCENARIOS[scenario].op;

	const condLeft = { x: COND.x, y: COND.y + COND.h / 2 };
	const condRight = { x: COND.x + COND.w, y: COND.y + COND.h / 2 };

	return (
		<div className="not-prose my-8 overflow-hidden rounded-xl border border-[#292929] bg-[#0F0F0F]">
			<div className="flex flex-wrap items-center gap-2 border-b border-[#292929] px-4 py-2.5">
				<span className="mr-1 font-mono text-[11px] text-[#FFFFFF4d]">
					transition
				</span>
				{SCENARIOS.map((s, i) => (
					<TogglePill
						active={scenario === i}
						key={s.label}
						onClick={() => setScenario(i)}
					>
						{s.label}
					</TogglePill>
				))}
			</div>

			<DiagramCanvas
				connectors={
					<>
						<Connector
							active
							from={{ x: CURRENT.x + CURRENT.w, y: CURRENT.y + CURRENT.h / 2 }}
							reduce={reduce}
							to={condLeft}
						/>
						<Connector
							active
							from={{ x: NEXT.x + NEXT.w, y: NEXT.y + NEXT.h / 2 }}
							reduce={reduce}
							to={condLeft}
						/>
						{OPS.map((op, i) => (
							<Connector
								active={i === activeOp}
								from={condRight}
								key={op.title}
								reduce={reduce}
								to={{ x: OP_X, y: OP_Y[i] + OP_H / 2 }}
							/>
						))}
					</>
				}
				height={H}
				width={W}
			>
				<NodeCard
					{...CURRENT}
					icon={<IconDoc />}
					subtitle="pro · v1"
					title="current plan"
				/>
				<NodeCard
					{...NEXT}
					icon={<IconDoc />}
					subtitle="pro · v2"
					title="next plan"
				/>
				<NodeCard
					{...COND}
					active
					icon={<IconBranch />}
					subtitle="if / else …"
					title="conditional"
				/>
				{OPS.map((op, i) => (
					<NodeCard
						active={i === activeOp}
						h={OP_H}
						icon={<IconCode />}
						key={op.title}
						muted={i !== activeOp}
						subtitle={op.sub}
						title={op.title}
						w={OP_W}
						x={OP_X}
						y={OP_Y[i]}
					/>
				))}
			</DiagramCanvas>

			<div className="min-h-[64px] border-t border-[#292929] px-2 py-1">
				<SyntaxHighlighter
					codeTagProps={{ style: { fontFamily: "inherit" } }}
					customStyle={{
						background: "transparent",
						margin: 0,
						padding: "8px",
						fontSize: "12px",
						lineHeight: 1.6,
					}}
					language="tsx"
					style={oneDark}
				>
					{SNIPPETS[activeOp]}
				</SyntaxHighlighter>
			</div>
		</div>
	);
}
