import { createOwnerLink, type OwnerLink } from "./createOwnerLink.js";
import type { SlotOwners } from "./types/slotOwners.js";

/** Slot `s` belongs to thread `s % threads`: fixed for the life of the process, so a customer never changes owner. */
export const createSlotOwners = ({
	index,
	threads,
	checkSheds,
}: {
	index: number;
	threads: number;
	checkSheds: Int32Array;
}): SlotOwners & {
	connect(params: { thread: number; port: MessagePort }): void;
	disconnect(params: { thread: number }): void;
} => {
	const links: OwnerLink[] = Array.from({ length: threads }, (_, thread) =>
		createOwnerLink({ thread, checkSheds }),
	);
	return {
		index,
		threads,
		ownerOf: ({ slot }) => slot % threads,
		processorOn: ({ thread, atomId }) => links[thread].processorFor({ atomId }),
		catalogOn: ({ thread, atomId }) => links[thread].catalogFor({ atomId }),
		connect: ({ thread, port }) => links[thread].connect({ port }),
		disconnect: ({ thread }) => links[thread].disconnect(),
	};
};
