import { createOwnerLink, type OwnerLink } from "./createOwnerLink.js";
import type { SlotOwners } from "./types/slotOwners.js";

/** Slot `s` belongs to thread `s % threads`: fixed for the life of the process, so a customer never changes owner. */
export const createSlotOwners = ({
	index,
	threads,
}: {
	index: number;
	threads: number;
}): SlotOwners & {
	connect(params: { thread: number; port: MessagePort }): void;
	disconnect(params: { thread: number }): void;
} => {
	const links: OwnerLink[] = Array.from({ length: threads }, (_, thread) =>
		createOwnerLink({ thread }),
	);
	return {
		index,
		ownerOf: ({ slot }) => slot % threads,
		processorOn: ({ thread, atomId }) => links[thread].processorFor({ atomId }),
		connect: ({ thread, port }) => links[thread].connect({ port }),
		disconnect: ({ thread }) => links[thread].disconnect(),
	};
};
