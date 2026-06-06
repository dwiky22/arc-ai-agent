const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const PRIVATE_KEY = "0xe175441c853bf817482af2f375840d56d4023b587d868eae382767cb5519beed";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    "https://rpc.testnet.arc.network"
  );

  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deploying from:", wallet.address);

  const artifactPath = path.join(__dirname, "../artifacts/contracts/SimpleAMM.sol/SimpleAMM.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  console.log("Deploying...");

  const contract = await factory.deploy(USDC, EURC, {
    gasLimit: 3000000,
    gasPrice: ethers.utils.parseUnits("10", "gwei")
  });

  await contract.deployed();
  console.log("✅ SimpleAMM deployed to:", contract.address);
}

main().catch(console.error);
