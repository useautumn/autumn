import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.NewPartitionReassignment;
import org.apache.kafka.clients.admin.NewPartitions;
import org.apache.kafka.common.TopicPartition;

/**
 * A warm Kafka admin for leaderChurn.ts: one stdin line per request, one stdout line back ("ok ..." or
 * "error ..."). A fresh kafka-reassign-partitions.sh JVM took 15s on a loaded 2-core box.
 *
 *   topic:partition:r1,r2 ...   reassigns each partition's replicas
 *   coord <groupId>             answers "ok <coordinator broker id>"
 *   grow topic:count ...        raises each topic's partition count
 */
public class ReassignPartitions {
	public static void main(String[] args) throws Exception {
		Properties props = new Properties();
		props.put("bootstrap.servers", args[0]);
		try (Admin admin = Admin.create(props);
				BufferedReader in = new BufferedReader(new InputStreamReader(System.in))) {
			System.out.println("ready");
			for (String line = in.readLine(); line != null; line = in.readLine()) {
				try {
					System.out.println(handle(admin, line.trim()));
				} catch (Exception e) {
					System.out.println("error " + String.valueOf(e.getMessage()).replace('\n', ' '));
				}
			}
		}
	}

	private static String handle(Admin admin, String line) throws Exception {
		if (line.startsWith("coord ")) {
			String group = line.substring("coord ".length());
			return "ok " + admin.describeConsumerGroups(List.of(group)).all().get().get(group).coordinator().id();
		}
		if (line.startsWith("grow ")) {
			Map<String, NewPartitions> growth = new HashMap<>();
			for (String entry : line.substring("grow ".length()).split(" ")) {
				String[] parts = entry.split(":");
				growth.put(parts[0], NewPartitions.increaseTo(Integer.parseInt(parts[1])));
			}
			admin.createPartitions(growth).all().get();
			return "ok";
		}
		Map<TopicPartition, Optional<NewPartitionReassignment>> moves = new HashMap<>();
		for (String entry : line.split(" ")) {
			String[] parts = entry.split(":");
			List<Integer> replicas = new ArrayList<>();
			for (String replica : parts[2].split(",")) replicas.add(Integer.parseInt(replica));
			moves.put(
					new TopicPartition(parts[0], Integer.parseInt(parts[1])),
					Optional.of(new NewPartitionReassignment(replicas)));
		}
		admin.alterPartitionReassignments(moves).all().get();
		return "ok";
	}
}
