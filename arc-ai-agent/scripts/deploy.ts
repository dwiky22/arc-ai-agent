import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const EURC = "0x08210F9170F89Ab7658F0B5E3fF39b0E03C2Bef";

  const provider = new ethers.JsonRpcProvider(
    "https://rpc.testnet.arc.network",
    { chainId: 5042002, name: "arc" }
  );

  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  console.log("Deploying from:", wallet.address);

  const artifactPath = join(__dirname, "../artifacts/contracts/SimpleAMM.sol/SimpleAMM.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  console.log("Sending deploy transaction...");
  const contract = await factory.deploy(USDC, EURC);
  
  console.log("Waiting for confirmation...");
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ SimpleAMM deployed to:", address);
}

main().catch(console.error);
