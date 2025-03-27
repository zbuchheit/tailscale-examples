#!/bin/bash
echo -e '\n#\n# Beginning Tailscale configuration...\n#\n'

sudo systemctl enable --now tailscaled
sudo tailscale up --auth-key=TAILSCALE_AUTH_KEY TAILSCALE_UP_FLAGS 