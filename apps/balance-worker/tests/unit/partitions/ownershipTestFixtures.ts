import type {
	PartitionRuntimePort,
	PartitionRuntimeResources,
} from "../../../src/partitions/types/partitions.js";

export type LifecycleTestRuntime = Pick<
	PartitionRuntimePort,
	"start" | "stop" | "getHealth"
>;

export const createTestRuntimeResources = ({
	runtime,
	markUnavailable = () => undefined,
}: {
	runtime: LifecycleTestRuntime;
	markUnavailable?: PartitionRuntimeResources["markUnavailable"];
}): PartitionRuntimeResources => {
	const drain = async (): Promise<void> => undefined;
	const subscribeUnavailable: PartitionRuntimePort["subscribeUnavailable"] =
		() => () =>
			undefined;
	const submitTrack: PartitionRuntimePort["submitTrack"] = async () => {
		throw new Error("Lifecycle fixture cannot execute tracks");
	};
	const check: PartitionRuntimePort["check"] = async () => {
		throw new Error("Lifecycle fixture cannot execute checks");
	};
	const claim = async () => ({ routeEpoch: "1" });
	const release = async (): Promise<void> => undefined;
	return {
		runtime: {
			...runtime,
			drain,
			waitForQuiescence: drain,
			subscribeUnavailable,
			submitTrack,
			check,
		},
		publication: { claim, release },
		markUnavailable,
	};
};
