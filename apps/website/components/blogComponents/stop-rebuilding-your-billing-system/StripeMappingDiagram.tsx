"use client";

import { useReducedMotion } from "motion/react";
import { useState } from "react";
import {
	Connector,
	DiagramCanvas,
	IconBank,
	IconCode,
	IconDoc,
	NodeCard,
} from "./diagramShared";
import { RunPill } from "./hierarchyShared";
import { TogglePill } from "./shared";

const W = 660;
const H = 200;

const CUSTOMER = { x: 16, y: 52, w: 210, h: 96 };
const SYNC = { x: 286, y: 76, w: 150, h: 48 };
const STRIPE = { x: 470, y: 52, w: 174, h: 96 };

type Version = "v1" | "v2";

export function StripeMappingDiagram() {
	const [appVersion, setAppVersion] = useState<Version>("v1");
	const [stripeVersion, setStripeVersion] = useState<Version>("v1");
	const reduce = useReducedMotion();

	const stale = appVersion !== stripeVersion;
	const credits = stripeVersion === "v2" ? 200 : 100;

	const setVersion = (v: Version) => setAppVersion(v);
	const sync = () => setStripeVersion(appVersion);

	return (
		<div className="not-prose my-8 overflow-hidden rounded-xl border border-[#292929] bg-[#0F0F0F]">
			<div className="flex flex-wrap items-center gap-2 border-b border-[#292929] px-4 py-2.5">
				<span className="mr-1 font-mono text-[11px] text-[#FFFFFF4d]">
					db state
				</span>
				<TogglePill
					active={appVersion === "v1"}
					onClick={() => setVersion("v1")}
				>
					v1
				</TogglePill>
				<TogglePill
					active={appVersion === "v2"}
					onClick={() => setVersion("v2")}
				>
					v2
				</TogglePill>
				<div className="ml-auto">
					<RunPill disabled={!stale} onClick={sync}>
						syncToStripe()
					</RunPill>
				</div>
			</div>

			<DiagramCanvas
				connectors={
					<>
						<Connector
							active
							from={{
								x: CUSTOMER.x + CUSTOMER.w,
								y: CUSTOMER.y + CUSTOMER.h / 2,
							}}
							reduce={reduce}
							to={{ x: SYNC.x, y: SYNC.y + SYNC.h / 2 }}
						/>
						<Connector
							active
							from={{ x: SYNC.x + SYNC.w, y: SYNC.y + SYNC.h / 2 }}
							reduce={reduce}
							to={{ x: STRIPE.x, y: STRIPE.y + STRIPE.h / 2 }}
						/>
					</>
				}
				height={H}
				width={W}
			>
				<NodeCard
					{...CUSTOMER}
					icon={<IconDoc />}
					subtitle="DB state"
					title="customer"
				>
					<div className="mt-2 space-y-0.5 font-mono text-[11px]">
						<div className="flex justify-between">
							<span className="text-[#FFFFFF66]">plan</span>
							<span className="text-[#E5E5E5]">pro</span>
						</div>
						<div className="flex justify-between">
							<span className="text-[#FFFFFF66]">version</span>
							<span className="text-[#9564ff]">{appVersion}</span>
						</div>
					</div>
				</NodeCard>

				<NodeCard {...SYNC} active icon={<IconCode />} title="syncToStripe()" />

				<NodeCard
					{...STRIPE}
					active={!stale}
					icon={<IconBank />}
					subtitle={stale ? "out of sync" : "in sync"}
					title="stripe"
				>
					<div className="mt-2 space-y-0.5 font-mono text-[11px]">
						<div className="text-[#E5E5E5]">
							Pro {stripeVersion} subscription
						</div>
						<div className="text-[#FFFFFF99]">{credits} credits</div>
					</div>
				</NodeCard>
			</DiagramCanvas>

			<div className="border-t border-[#292929] px-4 py-3 font-mono text-[12px]">
				{stale ? (
					<span className="text-[#ff6b6b]">
						stripe is stale — run syncToStripe() to converge
					</span>
				) : (
					<span className="text-[#9564ff]">
						in sync · syncToStripe only reads current state
					</span>
				)}
			</div>
		</div>
	);
}
