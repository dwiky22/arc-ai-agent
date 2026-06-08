"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { ethers } from "ethers";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

const CircleSwap   = dynamic(() => import("./components/CircleSwap"),   { ssr: false });
const CircleBridge = dynamic(() => import("./components/CircleBridge"), { ssr: false });

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const ARC_RPC      = "https://rpc.testnet.arc.network";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

type Tab = "swap" | "send" | "bridge" | "dashboard";

export default function Home() {
  const { address, isConnected } = useAccount();
  const wallet = address || "";

  const [activeTab, setActiveTab]   = useState<Tab>("swap");
  const [sendTo, setSendTo]         = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendToken, setSendToken]   = useState<"USDC"|"EURC">("USDC");
  const [sendStatus, setSendStatus] = useState("");
  const [usdcBal, setUsdcBal]       = useState("");
  const [eurcBal, setEurcBal]       = useState("");
  const [txHistory, setTxHistory]   = useState<string[]>([]);

  useEffect(() => {
    if (wallet) fetchBalances();
  }, [wallet]);

  async function fetchBalances() {
    if (!wallet) return;
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC);
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
      const eurc = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, provider);
      const [u, e] = await Promise.all([usdc.balanceOf(wallet), eurc.balanceOf(wallet)]);
      setUsdcBal(parseFloat(ethers.formatUnits(u, 6)).toFixed(2));
      setEurcBal(parseFloat(ethers.formatUnits(e, 6)).toFixed(2));
    } catch {}
  }

  async function handleSend() {
    if (!wallet || !sendTo || !sendAmount) return;
    setSendStatus("⏳ Mengirim... (konfirmasi di wallet)");
    try {
      const eth = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(eth);
      const signer   = await provider.getSigner();
      const tokenAddr = sendToken === "USDC" ? USDC_ADDRESS : EURC_ADDRESS;
      const contract  = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
      const tx = await contract.transfer(sendTo, ethers.parseUnits(sendAmount, 6));
      await tx.wait();
      setSendStatus(`✅ Berhasil kirim ${sendAmount} ${sendToken}`);
      setTxHistory(prev => [`${sendAmount} ${sendToken} → ${sendTo.slice(0,10)}...`, ...prev.slice(0,4)]);
      setSendAmount(""); setSendTo("");
      await fetchBalances();
    } catch (e: any) {
      if (e?.code === 4001) setSendStatus("❌ Dibatalkan.");
      else setSendStatus("❌ " + (e?.reason || e?.message || "Gagal").slice(0, 200));
    }
  }

  function handleSuccess(txHash: string) {
    setTxHistory(prev => [txHash.slice(0, 20) + "...", ...prev.slice(0, 4)]);
    fetchBalances();
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "swap",      label: "Swap",      icon: "⇄" },
    { id: "send",      label: "Send",      icon: "↗" },
    { id: "bridge",    label: "Bridge",    icon: "⬡" },
    { id: "dashboard", label: "Dashboard", icon: "◈" },
  ];

  return (
    <main className="flex h-screen bg-[#05060d] text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 border-r border-white/[0.06] bg-black/20 p-5 flex flex-col">
        <div className="mb-8">
          <h1 className="text-lg font-bold text-cyan-400 font-mono tracking-widest">ARC HUB</h1>
          <p className="text-[10px] text-gray-600 font-mono mt-0.5">ARC Testnet · Chain 5042002</p>
        </div>
        <nav className="space-y-1 flex-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl font-mono text-xs flex items-center gap-2.5 transition-all ${
                activeTab === t.id
                  ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-300"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"
              }`}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>

        {/* Balance di sidebar */}
        {isConnected && (
          <div className="border-t border-white/[0.05] pt-3 mt-3 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-600 font-mono">USDC</span>
              <span className="text-[10px] text-white font-mono">{usdcBal || "–"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-600 font-mono">EURC</span>
              <span className="text-[10px] text-white font-mono">{eurcBal || "–"}</span>
            </div>
            <button onClick={fetchBalances} className="text-[10px] text-gray-600 hover:text-gray-400 font-mono">↻ refresh</button>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-white/[0.06] flex items-center px-6 justify-between flex-shrink-0">
          <h2 className="font-mono text-sm font-bold text-white capitalize">{activeTab}</h2>
          <ConnectButton
            chainStatus="icon"
            accountStatus="avatar"
            showBalance={false}
          />
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {!isConnected && activeTab !== "dashboard" && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-gray-500 font-mono text-sm">Connect wallet untuk mulai</p>
              <ConnectButton />
            </div>
          )}

          {activeTab === "swap" && isConnected && (
            <CircleSwap wallet={wallet} onSuccess={handleSuccess} />
          )}

          {activeTab === "bridge" && isConnected && (
            <CircleBridge wallet={wallet} onSuccess={handleSuccess} />
          )}

          {activeTab === "send" && isConnected && (
            <div className="max-w-md mx-auto p-6 space-y-4">
              <div className="flex gap-2">
                {(["USDC", "EURC"] as const).map(t => (
                  <button key={t} onClick={() => setSendToken(t)}
                    className={`flex-1 py-2 rounded-xl font-mono text-xs font-bold border transition-all ${
                      sendToken === t
                        ? t === "USDC" ? "bg-blue-500/10 border-blue-500/30 text-blue-300" : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                        : "bg-white/[0.02] border-white/[0.06] text-gray-500"
                    }`}>{t}</button>
                ))}
              </div>

              <div>
                <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest block mb-1.5">Alamat Tujuan</label>
                <input placeholder="0x..." value={sendTo} onChange={e => setSendTo(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-cyan-500/40 text-white rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all placeholder:text-gray-700"/>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Jumlah</label>
                  <span className="text-[10px] text-gray-500 font-mono">bal: {sendToken === "USDC" ? usdcBal : eurcBal} {sendToken}</span>
                </div>
                <input type="number" placeholder="0.00" value={sendAmount} onChange={e => setSendAmount(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-cyan-500/40 text-white rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all placeholder:text-gray-700"/>
              </div>

              <button onClick={handleSend} disabled={!sendTo || !sendAmount || sendStatus.startsWith("⏳")}
                className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-25 text-white font-bold py-3.5 rounded-xl font-mono text-xs transition-all flex items-center justify-center gap-2">
                ↗ Kirim {sendAmount || "0"} {sendToken}
              </button>

              {sendStatus && (
                <div className={`rounded-xl px-4 py-3 text-xs font-mono border ${
                  sendStatus.startsWith("✅") ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-300"
                  : sendStatus.startsWith("❌") ? "bg-red-500/8 border-red-500/20 text-red-300"
                  : "bg-amber-500/8 border-amber-500/20 text-amber-300"
                }`}>{sendStatus}</div>
              )}
            </div>
          )}

          {activeTab === "dashboard" && (
            <div className="p-6 space-y-4 max-w-lg mx-auto">
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 space-y-3">
                <h3 className="font-mono text-xs text-gray-400 uppercase tracking-widest">Wallet</h3>
                {isConnected ? (
                  <>
                    <p className="font-mono text-sm text-white break-all">{wallet}</p>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3">
                        <p className="text-[10px] text-gray-500 font-mono">USDC</p>
                        <p className="text-lg font-bold font-mono text-white">{usdcBal || "–"}</p>
                      </div>
                      <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
                        <p className="text-[10px] text-gray-500 font-mono">EURC</p>
                        <p className="text-lg font-bold font-mono text-white">{eurcBal || "–"}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <ConnectButton />
                )}
              </div>

              {txHistory.length > 0 && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
                  <h3 className="font-mono text-xs text-gray-400 uppercase tracking-widest mb-3">Transaksi Terakhir</h3>
                  <div className="space-y-2">
                    {txHistory.map((tx, i) => (
                      <p key={i} className="text-[11px] font-mono text-gray-400">✓ {tx}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 space-y-2">
                <h3 className="font-mono text-xs text-gray-400 uppercase tracking-widest mb-3">Links</h3>
                <a href="https://faucet.circle.com" target="_blank" className="flex items-center gap-2 text-xs font-mono text-cyan-400 hover:text-cyan-300">↗ Circle Faucet</a>
                <a href={`https://testnet.arcscan.app/address/${wallet}`} target="_blank" className="flex items-center gap-2 text-xs font-mono text-cyan-400 hover:text-cyan-300">↗ ArcScan</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
