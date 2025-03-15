#!/bin/bash
echo -e '\n#\n# Beginning IP forwarding configuration...\n#\n'

echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sysctl -p /etc/sysctl.d/99-tailscale.conf

echo -e '\n#\n# Ip forwarding setup Complete.\n#\n'