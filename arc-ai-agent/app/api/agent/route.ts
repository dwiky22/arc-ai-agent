import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  const { message, walletAddress, balance } = await req.json();
  const systemPrompt = `You are an AI assistant for ARC AI DApp — a DeFi application on ARC Testnet (Chain ID: 5042002) using USDC as gas token.
User wallet: ${walletAddress || "not connected"}
User USDC balance: ${balance || "unknown"}
LANGUAGE RULE: Detect the language the user writes in and ALWAYS reply in that SAME language. Indonesian → Indonesian. English → English. Other language → that language.
You can help users with:
- Swapping USDC ↔ EURC (powered by Circle Swap Kit)
- Sending USDC or EURC to any wallet address
- Bridging USDC from other chains to ARC Testnet via Circle CCTP v2
- Explaining DeFi, wallets, gas fees, stablecoins, ARC Testnet
TRANSACTION RULES — when user wants a transaction, reply ONLY with raw JSON (no markdown, no extra text, no explanation):
SEND tokens:
{"action":"send","to":"0xADDRESS","amount":"AMOUNT","token":"USDC","reason":"short explanation in user language"}
SWAP tokens:
{"action":"swap","tokenIn":"USDC","tokenOut":"EURC","amount":"AMOUNT","reason":"short explanation in user language"}
BRIDGE USDC to ARC:
{"action":"bridge","fromChain":"Ethereum_Sepolia","toChain":"Arc_Testnet","amount":"AMOUNT","reason":"short explanation in user language"}
Supported bridge source chains: Ethereum_Sepolia, Base_Sepolia, Arbitrum_Sepolia, Avalanche_Fuji, OP_Sepolia.
For swap, tokenIn and tokenOut can be "USDC" or "EURC" — detect from user message.
For send, detect token from user message, default to USDC if not specified.
For all other questions, reply as a friendly and knowledgeable Web3 assistant in the user's language. Keep answers concise and helpful.`;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });
  const data = await response.json();
  console.log("Groq status:", response.status);
  console.log("Groq response:", JSON.stringify(data));
  if (!response.ok) {
    console.error("Groq error:", data);
    return NextResponse.json({
      type: "message",
      data: `API Error: ${data.error?.message || response.status}`,
    });
  }
  const text = data.choices?.[0]?.message?.content?.trim() || "Error dari AI";
  try {
    const parsed = JSON.parse(text);
    if (parsed.action) {
      return NextResponse.json({ type: "transaction", data: parsed });
    }
  } catch {}
  return NextResponse.json({ type: "message", data: text });
}
