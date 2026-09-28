export type SlotGateDescription =
	| {
			active: true;
			reason: "blue-green-disabled" | "no-active-record" | "active";
	  }
	| { active: false; reason: "idle"; expectedServiceArn: string };

export type SlotGateReason = SlotGateDescription["reason"];
