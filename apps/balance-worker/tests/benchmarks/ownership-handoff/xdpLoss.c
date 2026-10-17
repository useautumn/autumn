#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/in.h>
#include <linux/ip.h>
#include <linux/tcp.h>

#define SEC(name) __attribute__((section(name), used))

static unsigned int (*bpf_get_prandom_u32)(void) = (void *)BPF_FUNC_get_prandom_u32;

#ifndef LOSS_PER_MILLE
#define LOSS_PER_MILLE 300
#endif

#ifndef MATCH_PORT
#define MATCH_PORT 0
#endif

static __always_inline int matches_port(struct ethhdr *eth, void *data_end)
{
	if (MATCH_PORT == 0)
		return 1;
	struct iphdr *ip = (void *)(eth + 1);
	if ((void *)(ip + 1) > data_end)
		return 0;
	if (ip->protocol != IPPROTO_TCP)
		return 0;
	struct tcphdr *tcp = (void *)ip + (ip->ihl & 0xf) * 4;
	if ((void *)(tcp + 1) > data_end)
		return 0;
	return tcp->source == __builtin_bswap16(MATCH_PORT) ||
	       tcp->dest == __builtin_bswap16(MATCH_PORT);
}

SEC("xdp")
int xdp_loss(struct xdp_md *ctx)
{
	void *data = (void *)(long)ctx->data;
	void *data_end = (void *)(long)ctx->data_end;
	struct ethhdr *eth = data;
	if ((void *)(eth + 1) > data_end)
		return XDP_PASS;
	if (eth->h_proto != __builtin_bswap16(ETH_P_IP))
		return XDP_PASS;
	if (!matches_port(eth, data_end))
		return XDP_PASS;
	if (bpf_get_prandom_u32() % 1000 < LOSS_PER_MILLE)
		return XDP_DROP;
	return XDP_PASS;
}

char LICENSE[] SEC("license") = "GPL";
