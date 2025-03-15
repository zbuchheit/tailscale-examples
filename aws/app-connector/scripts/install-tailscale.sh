#!/bin/bash
echo -e '\n#\n# Beginning Tailscale installation...\n#\n'

curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list | sudo tee /etc/apt/sources.list.d/tailscale.list
echo -e '\n#\n# apt-get update...\n#\n'=
sudo apt-get -qq update
echo -e '\n#\n# apt-get install tailscale...\n#\n'
sudo apt-get install -yqq tailscale

echo -e '\n#\n# Tailscale installation Complete.\n#\n'