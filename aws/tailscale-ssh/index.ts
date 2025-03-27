import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as fs from "fs";
import * as tailscale from "@pulumi/tailscale";
import * as cloudinit from "@pulumi/cloudinit";
import { processScript } from "./util/substitution";

const config = new pulumi.Config();

const tailScaleConfig = new pulumi.Config("tailscale");
tailScaleConfig.requireSecret("apiKey"); // Required for the provider

const tailscaleAuthKey = new tailscale.TailnetKey("tailnet-auth-key", {
  description: "aws_ssh_keypair",
  ephemeral: true,
  expiry: 0,
  preauthorized: true,
  recreateIfInvalid: "always",
  reusable: true,
});

const tailscaleACL = new tailscale.Acl("tailnet-acl", {
  acl: fs.readFileSync("./acl.hujson", "utf8"),
  overwriteExistingContent: config.requireBoolean("overwriteExistingACL"),
});

const vpcCIDRBlock = config.get("vpcCIDRBlock") || "10.0.0.0/16";
const publicSubnetCIDR = config.get("publicSubnetCIDR") || "10.0.99.0/24";

const vpc = new awsx.ec2.Vpc("zbuchheit-tailscale-vpc", {
  cidrBlock: vpcCIDRBlock,
  numberOfAvailabilityZones: 1,
  subnetStrategy: awsx.ec2.SubnetAllocationStrategy.Auto,
  natGateways: {
    strategy: "None",
  },
  subnetSpecs: [
    {
      name: "zbuchheit-public",
      type: "Public",
      cidrBlocks: [publicSubnetCIDR],
    },
  ],
  enableDnsHostnames: true,
  enableDnsSupport: true,
});

const amazonLinux = aws.ec2.getAmiOutput({
  owners: ["amazon"],
  mostRecent: true,
  filters: [
    {
      name: "architecture",
      values: ["arm64"],
    },
    {
      name: "name",
      values: ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-*-server-*"],
    },
    {
      name: "virtualization-type",
      values: ["hvm"],
    },
  ],
});

const publicSecurityGroup = new aws.ec2.SecurityGroup("tailscale-public-sg", {
  egress: [
    {
      protocol: "udp",
      fromPort: 41641,
      toPort: 41641,
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      protocol: "tcp",
      fromPort: 443,
      toPort: 443,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  vpcId: vpc.vpc.id,
  tags: {
    Name: "zbuchheit-ts-public-sg",
  },
});

const cloudInitUserData = cloudinit.getConfigOutput({
  gzip: false,
  base64Encode: false,
  parts: [
    {
      contentType: "text/x-shellscript",
      filename: "install-tailscale.sh",
      content: fs.readFileSync("./scripts/install-tailscale.sh", "utf8"),
    },
    {
      contentType: "text/x-shellscript",
      filename: "tailscale-up.sh",
      content: processScript("./scripts/tailscale-up.sh", {
        TAILSCALE_AUTH_KEY: tailscaleAuthKey.key,
        TAILSCALE_UP_FLAGS: `--ssh`,
      }),
    },
  ],
});

const tailscaleSSHInstance = new aws.ec2.Instance(
  "ssh-demo-ts-instance",
  {
    subnetId: vpc.publicSubnetIds[0],
    instanceType: "t4g.nano",
    vpcSecurityGroupIds: [publicSecurityGroup.id],
    ami: amazonLinux.id,
    userData: cloudInitUserData.rendered,
    tags: {
      Name: "zbuchheit-ssh-demo-ts-instance",
    },
  },
  {
    replaceOnChanges: ["userData"],
  }
);
