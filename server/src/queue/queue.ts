import { Job, Queue, Worker } from "bullmq";
import { createSupabaseClient } from "@/external/supabaseUtils.js";

const getRedisConnection = () => {
  let redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  return {
    connection: {
      url: redisUrl,
    },
  };
};

export const initQueue = () => {
  try {
    return new Queue("recase", getRedisConnection());
  } catch (error) {
    console.error("Error initialising queue:\n", error);
    process.exit(1);
  }
};

const numWorkers = 3;

const initializeWorkspace = async (userId: string, packageJson: any) => {
  try {
    3;
    console.log("Successfully initialized workspace for:", userId);
  } catch (error: any) {
    console.log("Error initializing workspace for:", userId);
    console.log(error?.message || error);
  }

  const supabase = createSupabaseClient();
  await supabase
    .from("users")
    .update({
      initialized: true,
    })
    .eq("id", userId);

  await supabase.channel(`user_${userId}`).send({
    type: "broadcast",
    event: "user_initialized",
    payload: {
      userId: userId,
      initialized: true,
    },
  });
};

const initWorker = (id: number) => {
  let worker = new Worker(
    "recase",
    async (job: Job) => {
      if (job.name === "user_created") {
        await initializeWorkspace(job.data.userId, job.data.packageJson);
        return;
      }

      try {
      } catch (error) {
        console.error("BullMQ worker error:\n", error);
      }
    },
    getRedisConnection()
  );

  worker.on("ready", () => {
    console.log(`Worker ${id} ready`);
  });

  worker.on("error", (error) => {
    console.log("WORKER ERROR:\n");
    console.log(error);
    process.exit(1);
  });
};

export const initWorkers = () => {
  const workers = [];
  for (let i = 0; i < numWorkers; i++) {
    workers.push(initWorker(i));
  }

  return workers;
};
