/** Stands in for eve: one leaf world, one live stream reader printing each chunk. */
import { createWorld } from "../../../agent/lib/workflowWorld/workflowWorld.js";

const world = createWorld();
const stream = await world.streams.get(
	"wrun_fixture",
	process.env.STREAM_NAME as string,
);
const reader = stream.getReader();
console.log("ready");
while (true) {
	const { done, value } = await reader.read();
	if (done) break;
	console.log(`chunk:${new TextDecoder().decode(value)}`);
}
