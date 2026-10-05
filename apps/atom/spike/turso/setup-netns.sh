#!/usr/bin/env bash
# One network namespace ("blip") so a single replica can lose the network while the writer keeps going.
set -euo pipefail
sudo ip netns add blip
sudo ip link add vb0 type veth peer name vb1
sudo ip link set vb1 netns blip
sudo ip addr add 10.77.0.1/24 dev vb0 && sudo ip link set vb0 up
sudo ip netns exec blip ip addr add 10.77.0.2/24 dev vb1
sudo ip netns exec blip ip link set vb1 up && sudo ip netns exec blip ip link set lo up
sudo ip netns exec blip ip route add default via 10.77.0.1
sudo sysctl -qw net.ipv4.ip_forward=1
sudo iptables -t nat -A POSTROUTING -s 10.77.0.0/24 -j MASQUERADE
sudo iptables -A FORWARD -s 10.77.0.0/24 -j ACCEPT
sudo iptables -A FORWARD -d 10.77.0.0/24 -j ACCEPT
sudo mkdir -p /etc/netns/blip && sudo cp /etc/resolv.conf /etc/netns/blip/resolv.conf
