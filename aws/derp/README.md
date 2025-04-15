# Pulumi DERP Server Demo on AWS

This Pulumi project sets up a **Tailscale DERP (Designated Encrypted Relay for Packets) server** in AWS, along with a **private EC2 instance** that joins the same tailnet. This can be used to test Tailscale routing, connectivity, and self-hosted DERP functionality in a sandboxed environment.

---

## What This Stack Deploys

- **1 VPC** with both public and private subnets.
- **1 Public EC2 instance** running:
  - Tailscale (`tailscaled` with `--advertise-tags=tag:derp`)
  - A DERP server (`derper`)
- **1 Private EC2 instance** connected to the tailnet.
- A **Tailscale ACL** with DERP server IP and hostname substitutions.

---

## Getting Started
### Prerequisites

Before you deploy, ensure you have:

- Pulumi CLI
- Node.js + npm
- AWS credentials configured
- A valid Tailscale [API key](https://tailscale.com/kb/1210/api/) with ACL write permissions
- A Domain to provide a hostname and A record for your DERP server
### Setup
Install dependencies
```bash
npm install
```
Configuration
```
pulumi config set derpHostName myhostname.example.com
pulumi config set --secret tailscale:apiKey
```
Optionally Configure Subnet CIDRs
```
pulumi config set vpcCIDRBlock 10.1.0.0/16
pulumi config set publicSubnetCIDR 10.1.99.0/24
pulumi config set privateSubnetCIDR 10.1.1.0/24
```

Create in the Infra
```
pulumi up
```

## How It Works

Both EC2 instances bootstrap into the tailnet using an ephemeral, reusable auth key generate by Pulumi. The DERP instance advertises the tag:derp tag.

### Cloud-init Multi-part MIME
Cloud-init is used to install Tailscale and bring up the interface.

### Tailscale ACL
The ./acl.hujson file provides an example for configuring a Tailscale ACL.

### Running the DERP Server

Once deployed, run the following command to start your DERP server

```
sudo derper -hostname <your-derp-hostname> -verify-clients
```

You will likely want to set this up to work via systemd; this script is meant to show how to set the service up as is.

## Notes
DERP hostname must resolve publicly to the DERP instance IP in order to correctly get a LetsEncrypt cert.

## Teardown

```bash
pulumi destroy
```