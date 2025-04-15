import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as fs from "fs";
import * as tailscale from "@pulumi/tailscale";
import * as cloudinit from "@pulumi/cloudinit";
import { processScript } from "./util/substitution";

const config = new pulumi.Config();

const tailscaleConfig = new pulumi.Config("tailscale");
tailscaleConfig.requireSecret("apiKey"); // Required for the provider
const overwriteExistingACL = config.requireBoolean("overwriteExistingACL"); // WARNING: SETTING THIS TO TRUE WILL OVERWRITE YOUR ACL
const derpHostName = config.require("derpHostName");
const stackName = pulumi.getStack()

const tailscaleAuthKey = new tailscale.TailnetKey("tailnet-auth-key", {
  description: "derp-server-demo",
  ephemeral: true,
  expiry: 0,
  preauthorized: true,
  recreateIfInvalid: "always",
  reusable: true,
});

const vpcCIDRBlock = config.get("vpcCIDRBlock") || "10.0.0.0/16";
const privateSubnetCIDR1 = config.get("privateSubnetCIDR") || "10.0.1.0/24";
const publicSubnetCIDR = config.get("publicSubnetCIDR") || "10.0.99.0/24";

const vpc = new awsx.ec2.Vpc(`${stackName}-tailscale-vpc`, {
  cidrBlock: vpcCIDRBlock,
  numberOfAvailabilityZones: 1,
  subnetStrategy: awsx.ec2.SubnetAllocationStrategy.Auto,
  subnetSpecs: [
    {
      name: `${stackName}-public`,
      type: "Public",
      cidrBlocks: [publicSubnetCIDR],
    },
    {
      name: `${stackName}-private`,
      type: "Private",
      cidrBlocks: [privateSubnetCIDR1],
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

const publicSecurityGroup = new aws.ec2.SecurityGroup(`${stackName}-tailscale-public-sg`, {
  description: "Allow DERP Traffic",
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  ingress: [
    {
      protocol: "tcp",
      fromPort: 80,
      toPort: 80,
      cidrBlocks: ["0.0.0.0/0"],
      description: "HTTP"
    },
    {
      protocol: "tcp",
      fromPort: 443,
      toPort: 443,
      cidrBlocks: ["0.0.0.0/0"],
      description: "HTTPS"
    },
    {
      protocol: "udp",
      fromPort: 3478,
      toPort: 3478,
      cidrBlocks: ["0.0.0.0/0"],
      description: "STUN"
    },
  ],
  vpcId: vpc.vpc.id,
  tags: {
    Name: `${stackName}-ts-public-sg`,
  },
});

const cloudInitUserData = cloudinit.getConfigOutput({
  gzip: false,
  base64Encode: false,
  parts: [
    {
      contentType: "text/cloud-config",
      filename: "tailscale-up.yaml",
      content: processScript("./scripts/tailscale-up.yaml", {
        TAILSCALE_AUTH_KEY: tailscaleAuthKey.key,
        TAILSCALE_UP_FLAGS: `--ssh --advertise-tags=tag:derp`,
      }),
    },
    {
      contentType: "text/cloud-config",
      filename: "derp-setup.yaml",
      content: fs.readFileSync("./scripts/derp-setup.yaml", "utf-8"),
    },
  ],
});

const derpServer = new aws.ec2.Instance(
  `${stackName}-tailscale-derp`,
  {
    subnetId: vpc.publicSubnetIds[0],
    instanceType: "t4g.small",
    vpcSecurityGroupIds: [publicSecurityGroup.id],
    ami: amazonLinux.id,
    userData: cloudInitUserData.rendered,
    tags: {
      Name: `${stackName}-ts-derp`,
    },
  },
  {
    replaceOnChanges: ["userData"],
  }
);

const privateSecurityGroup = new aws.ec2.SecurityGroup(`${stackName}-tailscale-private-sg`, {
  description: "Allow Internet Access via Nat Gateway",
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
      description: "Allow Internet Egress"
    },
  ],
  vpcId: vpc.vpc.id,
  tags: {
    Name: `${stackName}-ts-private-sg`,
  },
});

const cloudInitUserDataPrivateInstance = cloudinit.getConfigOutput({
  gzip: false,
  base64Encode: false,
  parts: [
    {
      contentType: "text/cloud-config",
      filename: "tailscale-up.yaml",
      content: processScript("./scripts/tailscale-up.yaml", {
        TAILSCALE_AUTH_KEY: tailscaleAuthKey.key,
        TAILSCALE_UP_FLAGS: ``,
      }),
    },
  ],
});

const privateInstance = new aws.ec2.Instance(
  `${stackName}-tailscale-private-instance`,
  {
    subnetId: vpc.privateSubnetIds[0],
    instanceType: "t4g.nano",
    vpcSecurityGroupIds: [privateSecurityGroup.id],
    ami: amazonLinux.id,
    userData: cloudInitUserDataPrivateInstance.rendered,
    tags: {
      Name: `${stackName}-ts-private-instance`,
    },
  },
  { replaceOnChanges: ["userData"] }
);

new tailscale.Acl(
  `${stackName}-tailscale-acl`,
  {
    acl: processScript("./acl.hujson", {
      DERP_SERVER_PUBLIC_IP: derpServer.publicIp,
      DERP_HOSTNAME: derpHostName,
    }),
    overwriteExistingContent: overwriteExistingACL,
  },
  {
    dependsOn: [privateInstance],
  }
);

const tailscaleHostName = derpServer.privateIp.apply(ip => ip.replace(/\./g,"-"))

const tailscaleDevice = tailscale.getDeviceOutput({
    hostname: pulumi.interpolate`ip-${tailscaleHostName}`,
    waitFor: "60s"
})

export const connectionString = pulumi.interpolate`ssh ubuntu@${tailscaleDevice.hostname}`;
export const derpCommand = pulumi.interpolate`sudo derper -hostname ${derpHostName} -verify-clients`;
