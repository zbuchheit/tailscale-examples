#!/bin/bash
echo -e '\n#\n# Beginning Tailscale configuration...\n#\n'

sudo systemctl enable --now tailscaled
sudo tailscale up --advertise-tags=tag:connector --advertise-connector --auth-key=TAILSCALE_AUTH_KEY