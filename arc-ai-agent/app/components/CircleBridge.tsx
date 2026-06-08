"use client";
import { useState } from "react";
import { ethers } from "ethers";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createEthersAdapterFromProvider } from "@circle-fin/adapter-ethers-v6";

const BRIDGE_CHAINS = [
  { value: "Ethereum_Sepolia" as const, label: "Ethereum Sepolia", icon: "Ξ", usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", chainIdHex: "0xaa36a7", rpc: "https://ethereum-sepolia-rpc.publicnode.com", symbol: "ETH" },
  { value: "Base_Sepolia"     as const, label: "Base Sepolia",     icon: "B", usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", chainIdHex: "0x14a34",  rpc: "https://base-sepolia-rpc.publicnode.com",  symbol: "ETH" },
  { value: "Arbitrum_Sepolia" as const, label: "Arbitrum Sepolia", icon: "A", usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", chainIdHex: "0x66eee",  rpc: "https://sepolia-rollup.arbitrum.io/rpc",   symbol: "ETH" },
  { value: "Avalanche_Fuji"   as const, label: "Avalanche Fuji",   icon: "▲", usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65", chainIdHex: "0xa869",   rpc: "https://api.avax-test.network/ext/bc/C/rpc", symbol: "AVAX" },
  { value: "Optimism_Sepolia" as const, label: "Optimism Sepolia", icon: "O", usdcAddress: "0x5fd84259d66Cd46123540766Be93DFE6D43130D9", chainIdHex: "0xaa37dc", rpc: "https://sepolia.optimism.io",              symbol: "ETH" },
];

const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];

interface Props { wallet: string; onSuccess: (txHash: string) => void; }

export default function CircleBridge({ wallet, onSuccess }: Props) {
  const [fromChain, setFromChain]   = useState<typeof BRIDGE_CHAINS[number]["value"]>("Base_Sepolia");
  const [amount, setAmount]         = useState("");
  const [srcBalance, setSrcBalance] = useState("");
  const [loading, setLoading]       = useState(false);
  const [switching, setSwitching]   = useState(false);
  const [status, setStatus]         = useState("");
  const [steps, setSteps]           = useState<string[]>([]);

  async function switchToChain(chainIdHex: string, name: string, rpc: string, symbol: string) {
    const eth = (window as any).ethereum;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
    } catch (e: any) {
      if (e.code === 4902 || e.code === -32603) {
        await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: chainIdHex, chainName: name, rpcUrls: [rpc], nativeCurrency: { name: symbol, symbol, decimals: 18 } }] });
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
      } else throw e;
    }
    await new Promise(r => setTimeout(r, 600));
  }

  async function switchAndFetch(chainVal: typeof BRIDGE_CHAINS[number]["value"]) {
    if (!wallet) return;
    setSwitching(true); setSrcBalance("");
    const cfg = BRIDGE_CHAINS.find(c => c.value === chainVal)!;
    try {
      await switchToChain(cfg.chainIdHex, cfg.label, cfg.rpc, cfg.symbol);
      const eth = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(eth);
      const usdc = new ethers.Contract(cfg.usdcAddress, USDC_ABI, provider);
      const bal = await usdc.balanceOf(wallet);
      setSrcBalance(parseFloat(ethers.formatUnits(bal, 6)).toFixed(2));
    } catch (e: any) { console.warn(e.message); }
    setSwitching(false);
  }

  async function handleBridge() {
    if (!amount || !wallet) return;
    setLoading(true); setStatus(""); setSteps([]);
    try {
      const cfg = BRIDGE_CHAINS.find(c => c.value === fromChain)!;
      const eth = (window as any).ethereum;

      setStatus("⏳ Switching ke " + cfg.label + "...");
      await switchToChain(cfg.chainIdHex, cfg.label, cfg.rpc, cfg.symbol);

      setStatus("⏳ Membuat adapter...");
      const adapter = await createEthersAdapterFromProvider({ provider: eth });

      // Register event listener untuk progress
      const kit = new BridgeKit();
      kit.on("*" as any, (payload: any) => {
        const action = payload?.method || payload?.action || "";
        if (action) setStatus(`⏳ ${action}...`);
      });

      setStatus("⏳ Estimating fee...");
      const estimate = await kit.estimate({
        from: { adapter, chain: cfg.value },
        to:   { chain: "Arc_Testnet", recipientAddress: wallet, useForwarder: true },
        amount,
      });
      setSteps([`est. fee: ~${(estimate as any)?.maxFee ?? "0"} USDC`]);

      setStatus("⏳ Bridging... (confirm approve + burn di wallet)");
      const result = await kit.bridge({
        from: { adapter, chain: cfg.value },
        to:   { chain: "Arc_Testnet", recipientAddress: wallet, useForwarder: true },
        amount,
      });

      const txHash = (result as any)?.steps?.find((s: any) => s.name === "mint" && s.txHash)?.txHash
        || (result as any)?.steps?.find((s: any) => s.txHash)?.txHash
        || "";

      setSteps(prev => [...prev, `bridge: ✓${txHash ? " " + txHash.slice(0, 14) + "..." : " done"}`]);
      setStatus(`✅ Bridge selesai! ${amount} USDC sudah di ARC Testnet!`);
      setAmount(""); setSrcBalance("");
      if (txHash) onSuccess(txHash);

    } catch (e: any) {
      if (e?.code === 4001 || e?.code === "ACTION_REJECTED") {
        setStatus("❌ Dibatalkan oleh user.");
      } else {
        const msg = e?.reason || e?.message || "Bridge failed";
        setStatus("❌ " + String(msg).slice(0, 300));
      }
    }
    setLoading(false);
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Source Chain</label>
          {switching && <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1"><div className="w-2 h-2 border border-amber-400 border-t-transparent rounded-full animate-spin"/>switching...</span>}
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {BRIDGE_CHAINS.map(c => (
            <button key={c.value} onClick={() => { setFromChain(c.value); switchAndFetch(c.value); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${fromChain === c.value ? "bg-blue-500/10 border-blue-500/30 text-white" : "bg-white/[0.02] border-white/[0.05] text-gray-500 hover:border-white/10 hover:text-gray-300"}`}>
              <span className="w-6 h-6 rounded-lg bg-black/30 flex items-center justify-center text-[11px] font-bold flex-shrink-0">{c.icon}</span>
              <span className="font-mono text-xs flex-1">{c.label}</span>
              {fromChain === c.value && srcBalance && <span className="text-[10px] text-blue-400 font-mono">{srcBalance} USDC</span>}
              {fromChain === c.value && <span className="text-blue-400 text-xs">✓</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/[0.05]"/>
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xs">↓</div>
        <div className="flex-1 h-px bg-white/[0.05]"/>
      </div>

      <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-xs">A</div>
          <div>
            <p className="text-white font-mono text-xs font-bold">ARC Testnet</p>
            <p className="text-[10px] text-gray-600 font-mono">via Circle Bridge Kit · Forwarder Auto-mint</p>
          </div>
        </div>
        <span className="text-[10px] text-cyan-400/70 font-mono bg-cyan-500/8 border border-cyan-500/15 px-2 py-1 rounded-lg">Auto ✓</span>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Amount USDC</label>
          {srcBalance && <button onClick={() => setAmount(srcBalance)} className="text-[10px] text-blue-400 hover:text-blue-300 font-mono">MAX: {srcBalance}</button>}
        </div>
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number"
          className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-blue-500/40 text-white rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all placeholder:text-gray-700"/>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 space-y-1.5">
        <p className="text-[10px] text-gray-500 font-mono">🔐 Circle Bridge Kit · CCTP v2 · Orbit Forwarder</p>
        <p className="text-[10px] text-gray-500 font-mono">⏱ Auto-mint oleh Circle Relayer · ~2-5 menit</p>
        <p className="text-[10px] text-amber-500/70 font-mono">⚠ Jangan tutup tab selama proses berlangsung</p>
      </div>

      <button onClick={handleBridge} disabled={!wallet || !amount || loading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-25 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl font-mono text-xs transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30">
        {loading ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>Bridging...</> : <>⬡ Bridge {amount || "0"} USDC → ARC</>}
      </button>

      {steps.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 space-y-1">
          {steps.map((s, i) => <p key={i} className="text-[10px] font-mono text-gray-400">✓ {s}</p>)}
        </div>
      )}

      {status && (
        <div className={`rounded-xl px-4 py-3 text-xs font-mono border whitespace-pre-wrap ${status.startsWith("✅") ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-300" : status.startsWith("❌") ? "bg-red-500/8 border-red-500/20 text-red-300" : "bg-amber-500/8 border-amber-500/20 text-amber-300"}`}>{status}</div>
      )}
    </div>
  );
}
