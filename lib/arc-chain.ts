export const ARC_TESTNET = {
  chainId: "0x4CE752",
  chainName: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 6,
  },
  rpcUrls: ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://testnet.arcscan.app"],
};

export async function addArcNetwork() {
  await (window as any).ethereum.request({
    method: "wallet_addEthereumChain",
    params: [ARC_TESTNET],
  });
}

export async function switchToArc() {
  try {
    await (window as any).ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_TESTNET.chainId }],
    });
  } catch (e: any) {
    if (e.code === 4902) await addArcNetwork();
  }
}
