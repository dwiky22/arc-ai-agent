import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	try {
		const { message, walletAddress, balanceUSDC, balanceEURC } = await req.json();

		const systemPrompt = `You are an AI agent on ARC Testnet (Chain ID: 5042002), built by Circle.
User wallet: ${walletAddress || "not connected"}
USDC balance: ${balanceUSDC || "0"}
EURC balance: ${balanceEURC || "0"}

ARC Testnet tokens:
- USDC (native): 0x3600000000000000000000000000000000000000
- EURC: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a

You can execute these actions. When user requests one, respond ONLY with JSON (no markdown):

Send USDC: {"action":"send","token":"USDC","to":"0x...","amount":"1.0","reason":"..."}
Send EURC: {"action":"send","token":"EURC","to":"0x...","amount":"1.0","reason":"..."}
Check balance: {"action":"balance","reason":"..."}

For anything else, respond normally in Bahasa Indonesia. Be helpful and concise.`;

		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
				"HTTP-Referer": "https://arc-ai-agent.vercel.app",
				"X-Title": "ARC AI Agent",
			},
			body: JSON.stringify({
				model: model: "google/gemma-3-4b-it:free",
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: message }
				],
			}),
		});

		const json = await res.json();

		if (!res.ok) {
			return NextResponse.json({ type: "message", data: "❌ API Error: " + json.error?.message });
		}

		const text = json.choices?.[0]?.message?.content?.trim() || "";

		try {
			const cleaned = text.replace(/```json|```/g, "").trim();
			const parsed = JSON.parse(cleaned);
			if (parsed.action) {
				return NextResponse.json({ type: "action", data: parsed });
			}
		} catch {
			// bukan JSON
		}

		return NextResponse.json({ type: "message", data: text });

	} catch (e: any) {
		return NextResponse.json({ type: "message", data: "❌ Error: " + e.message });
	}
}
