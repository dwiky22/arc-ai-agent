"use client";
import { useState } from "react";
import { ethers } from "ethers";

// ─── CCTP v2 Source Chain Config ─────────────────────────────
const BRIDGE_CHAIN_CONFIG: Record<string, {
  chainIdHex: string; name: string; rpc: string; symbol: string;
  usdcAddress: string; tokenMessenger: string; cctpDomain: number;
}> = {
  Ethereum_Sepolia: {
    chainIdHex: "0xaa36a7", name: "Ethereum Sepolia", rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    symbol: "ETH", usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5", cctpDomain: 0,
  },
  Base_Sepolia: {
    chainIdHex: "0x14a34", name: "Base Sepolia", rpc: "https://base-sepolia-rpc.publicnode.com",
    symbol: "ETH", usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5", cctpDomain: 6,
  },
  Arbitrum_Sepolia: {
    chainIdHex: "0x66eee", name: "Arbitrum Sepolia", rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    symbol: "ETH", usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5", cctpDomain: 3,
  },
  Avalanche_Fuji: {
    chainIdHex: "0xa869", name: "Avalanche Fuji", rpc: "https://api.avax-test.network/ext/bc/C/rpc",
    symbol: "AVAX", usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    tokenMessenger: "0xeb08f243E5d3FCFF26A9E38Ae5520A669f4019d0", cctpDomain: 1,
  },
  OP_Sepolia: {
    chainIdHex: "0xaa37dc", name: "Optimism Sepolia", rpc: "https://sepolia.optimism.io",
    symbol: "ETH", usdcAddress: "0x5fd84259d66Cd46123540766Be93DFE6D43130D9",
    tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5", cctpDomain: 2,
  },
};

// ─── ARC Testnet CCTP domain = 26 (dari docs resmi) ──────────
const ARC_CCTP_DOMAIN = 26;
const ARC_CHAIN_ID_HEX = "0x4cef52"; // 5042002

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
const TOKEN_MESSENGER_ABI = [
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)",
];

const BRIDGE_CHAINS = [
  { value: "Ethereum_Sepolia", label: "Ethereum Sepolia", icon: "Ξ" },
  { value: "Base_Sepolia",     label: "Base Sepolia",     icon: "B" },
  { value: "Arbitrum_Sepolia", label: "Arbitrum Sepolia", icon: "A" },
  { value: "Avalanche_Fuji",   label: "Avalanche Fuji",   icon: "▲" },
  { value: "OP_Sepolia",       label: "Optimism Sepolia", icon: "O" },
];

interface Props {
  wallet: string;
  onSuccess: (txHash: string) => void;
}

export default function CircleBridge({ wallet, onSuccess }: Props) {
  const [fromChain, setFromChain]   = useState("Base_Sepolia");
  const [amount, setAmount]         = useState("");
  const [srcBalance, setSrcBalance] = useState("");
  const [loading, setLoading]       = useState(false);
  const [switching, setSwitching]   = useState(false);
  const [status, setStatus]         = useState("");
  const [txHash, setTxHash]         = useState("");

  async function switchAndFetch(chain: string) {
    if (!wallet) return;
    setSwitching(true);
    setSrcBalance("");
    setStatus("");
    try {
      const cfg = BRIDGE_CHAIN_CONFIG[chain];
      const eth = (window as any).ethereum;
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: cfg.chainIdHex }] });
      } catch (e: any) {
        if (e.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: cfg.chainIdHex, chainName: cfg.name, rpcUrls: [cfg.rpc], nativeCurrency: { name: cfg.symbol, symbol: cfg.symbol, decimals: 18 } }],
          });
        }
      }
      const provider = new ethers.BrowserProvider(eth);
      const usdc = new ethers.Contract(cfg.usdcAddress, USDC_ABI, provider);
      const bal = await usdc.balanceOf(wallet);
      setSrcBalance(parseFloat(ethers.formatUnits(bal, 6)).toFixed(2));
    } catch (e: any) {
      console.warn("Switch error:", e.message);
    }
    setSwitching(false);
  }

  async function handleBridge() {
    if (!amount || !wallet) return;
    setLoading(true);
    setStatus("");
    setTxHash("");
    try {
      const cfg = BRIDGE_CHAIN_CONFIG[fromChain];
      const eth = (window as any).ethereum;

      // Step 1: Switch ke source chain
      setStatus("⏳ Switching to " + cfg.name + "...");
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: cfg.chainIdHex }] });
      } catch (e: any) {
        if (e.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: cfg.chainIdHex, chainName: cfg.name, rpcUrls: [cfg.rpc], nativeCurrency: { name: cfg.symbol, symbol: cfg.symbol, decimals: 18 } }],
          });
        } else throw e;
      }

      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const parsed = ethers.parseUnits(amount, 6);

      // Step 2: Cek saldo
      setStatus("⏳ Checking USDC balance on " + cfg.name + "...");
      const usdc = new ethers.Contract(cfg.usdcAddress, USDC_ABI, signer);
      const bal = await usdc.balanceOf(wallet);
      const balFmt = parseFloat(ethers.formatUnits(bal, 6)).toFixed(2);
      setSrcBalance(balFmt);

      if (parseFloat(balFmt) < parseFloat(amount)) {
        setStatus(`❌ Saldo tidak cukup di ${cfg.name}. Saldo: ${balFmt} USDC`);
        setLoading(false);
        return;
      }

      // Step 3: Approve USDC ke TokenMessenger
      setStatus("⏳ Approving USDC... (confirm di wallet)");
      const approveTx = await usdc.approve(cfg.tokenMessenger, parsed);
      await approveTx.wait();

      // Step 4: depositForBurn via CCTP v2
      setStatus("⏳ Burning USDC via CCTP v2... (confirm di wallet)");
      const messenger = new ethers.Contract(cfg.tokenMessenger, TOKEN_MESSENGER_ABI, signer);
      const mintRecipient = ethers.zeroPadValue(wallet, 32);
      const burnTx = await messenger.depositForBurn(parsed, ARC_CCTP_DOMAIN, mintRecipient, cfg.usdcAddress);
      await burnTx.wait();

      setTxHash(burnTx.hash);
      setStatus(`✅ Bridge submitted! ${amount} USDC burned on ${cfg.name} → minting on ARC (~2-5 min)`);
      setAmount("");
      onSuccess(burnTx.hash);

      // Step 5: Auto switch balik ke ARC
      setTimeout(async () => {
        try {
          await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID_HEX }] });
        } catch {}
      }, 2000);

    } catch (e: any) {
      setStatus("❌ " + (e.message || "Bridge failed").slice(0, 150));
    }
    setLoading(false);
  }

  return (
    <div className="p-6 space-y-4">
      {/* Source chain */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Source Chain</label>
          {switching && (
            <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
              <div className="w-2 h-2 border border-amber-400 border-t-transparent rounded-full animate-spin"/>
              switching...
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {BRIDGE_CHAINS.map(c => (
            <button key={c.value} onClick={() => { setFromChain(c.value); switchAndFetch(c.value); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                fromChain === c.value
                  ? "bg-blue-500/10 border-blue-500/30 text-white"
                  : "bg-white/[0.02] border-white/[0.05] text-gray-500 hover:border-white/10 hover:text-gray-300"
              }`}>
              <span className="w-6 h-6 rounded-lg bg-black/30 flex items-center justify-center text-[11px] font-bold flex-shrink-0">{c.icon}</span>
              <span className="font-mono text-xs flex-1">{c.label}</span>
              {fromChain === c.value && srcBalance && (
                <span className="text-[10px] text-blue-400 font-mono">{srcBalance} USDC</span>
              )}
              {fromChain === c.value && <span className="text-blue-400 text-xs">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/[0.05]"/>
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xs">↓</div>
        <div className="flex-1 h-px bg-white/[0.05]"/>
      </div>

      {/* Destination */}
      <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-xs">A</div>
          <div>
            <p className="text-white font-mono text-xs font-bold">ARC Testnet</p>
            <p className="text-[10px] text-gray-600 font-mono">CCTP Domain 26 · Always</p>
          </div>
        </div>
        <span className="text-[10px] text-cyan-400/70 font-mono bg-cyan-500/8 border border-cyan-500/15 px-2 py-1 rounded-lg">5042002</span>
      </div>

      {/* Amount */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Amount USDC</label>
          {srcBalance && (
            <button onClick={() => setAmount(srcBalance)} className="text-[10px] text-blue-400 hover:text-blue-300 font-mono transition-colors">
              MAX: {srcBalance}
            </button>
          )}
        </div>
        <input value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="0.00" type="number"
          className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-blue-500/40 text-white rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all placeholder:text-gray-700"/>
      </div>

      {/* Info */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 space-y-1.5">
        <p className="text-[10px] text-gray-500 font-mono">🔐 Circle CCTP v2 — depositForBurn → mint native USDC</p>
        <p className="text-[10px] text-gray-500 font-mono">⏱ ETA: ~2–5 menit setelah konfirmasi</p>
        <p className="text-[10px] text-gray-500 font-mono">🔗 CCTP Domain ARC: 26 (resmi dari docs.arc.io)</p>
        <p className="text-[10px] text-amber-500/70 font-mono">⚠ Auto-switch ke source chain sebelum bridge</p>
      </div>

      <button onClick={handleBridge} disabled={!wallet || !amount || loading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-25 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl font-mono text-xs transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30">
        {loading
          ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>Bridging via CCTP v2...</>
          : <>⬡ Bridge {amount || "0"} USDC → ARC</>}
      </button>

      {status && (
        <div className={`rounded-xl px-4 py-3 text-xs font-mono border ${
          status.startsWith("✅") ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-300" :
          status.startsWith("❌") ? "bg-red-500/8 border-red-500/20 text-red-300" :
          "bg-amber-500/8 border-amber-500/20 text-amber-300"
        }`}>
          {status}
          {txHash && (
            <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank"
              className="block mt-2 text-cyan-400 text-[11px] underline hover:text-cyan-300">
              ↗ View on ArcScan
            </a>
          )}
        </div>
      )}
    </div>
  );
}
