const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env" });

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const EURC = "0x08210F9170F89Ab7658F0B5E3fF39b0E03C2Bef";

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    "https://rpc.testnet.arc.network"
  );

  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deploying from:", wallet.address);

  const artifactPath = path.join(__dirname, "artifacts/contracts/SimpleAMM.sol/SimpleAMM.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  console.log("Deploying...");
  const contract = await factory.deploy(USDC, EURC);
  await contract.deployed();

  console.log("✅ SimpleAMM deployed to:", contract.address);
}

main().catch(console.error);
