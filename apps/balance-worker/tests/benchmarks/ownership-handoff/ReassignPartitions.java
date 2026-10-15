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
import org.apache.kafka.common.TopicPartition;

/**
 * A warm Kafka admin for leaderChurn.ts: one stdin line per wave ("topic:partition:r1,r2 ..."), one stdout
 * line back ("ok" or "error ..."). A fresh kafka-reassign-partitions.sh JVM took 15s on a loaded 2-core box.
 */
public class ReassignPartitions {
	public static void main(String[] args) throws Exception {
		Properties props = new Properties();
		props.put("bootstrap.servers", args[0]);
		try (Admin admin = Admin.create(props);
				BufferedReader in = new BufferedReader(new InputStreamReader(System.in))) {
			System.out.println("ready");
			for (String line = in.readLine(); line != null; line = in.readLine()) {
				Map<TopicPartition, Optional<NewPartitionReassignment>> moves = new HashMap<>();
				for (String entry : line.trim().split(" ")) {
					String[] parts = entry.split(":");
					List<Integer> replicas = new ArrayList<>();
					for (String replica : parts[2].split(",")) replicas.add(Integer.parseInt(replica));
					moves.put(
							new TopicPartition(parts[0], Integer.parseInt(parts[1])),
							Optional.of(new NewPartitionReassignment(replicas)));
				}
				try {
					admin.alterPartitionReassignments(moves).all().get();
					System.out.println("ok");
				} catch (Exception e) {
					System.out.println("error " + e.getMessage().replace('\n', ' '));
				}
			}
		}
	}
}
