import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      message, 
      history = [], 
      prompt, 
      api_key,
      is_lead_tool_enabled,
      is_store_tool_enabled
    } = body;

    const apiKey = api_key || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API Key is required to test the chatbot." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    // Build history context (pruning history to last 5 messages for cost optimization)
    const prunedHistory = history.slice(-5);
    const chatHistory = prunedHistory.map((m: any) => ({
      role: m.sender === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    }));

    // Append the current message as the 6th context message
    chatHistory.push({
      role: "user",
      parts: [{ text: message }],
    });

    // Define function declarations for AI agent sandbox testing
    const functionDeclarations: any[] = [];
    if (is_lead_tool_enabled) {
      functionDeclarations.push({
        name: "check_lead_status",
        description: "Checks the status of a lead or demo booking in the database using their email or phone number.",
        parameters: {
          type: "OBJECT",
          properties: {
            email_or_phone: {
              type: "STRING",
              description: "The customer's email address or phone number to look up."
            }
          },
          required: ["email_or_phone"]
        }
      });
    }

    if (is_store_tool_enabled) {
      functionDeclarations.push({
        name: "get_store_products",
        description: "Retrieves the revision ebooks store catalog listing titles, descriptions, pricing, and purchase links.",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      });
    }

    const apiPayload: Record<string, any> = {
      contents: chatHistory,
      generationConfig: {
        maxOutputTokens: 1024, // Increase token cap to accommodate thinking process
        temperature: 0.7,
      },
      systemInstruction: {
        parts: [{ text: prompt || "You are a helpful assistant." }],
      },
    };

    if (functionDeclarations.length > 0) {
      apiPayload.tools = [{ functionDeclarations }];
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiPayload),
    });

    const result = await res.json();
    
    if (!res.ok) {
      throw new Error(result.error?.message || "Failed calling Gemini API");
    }

    let reply = "";
    const firstPart = result.candidates?.[0]?.content?.parts?.[0];

    // Check if Gemini triggers a tool call in simulator sandbox
    if (firstPart && firstPart.functionCall) {
      const { name: funcName, args } = firstPart.functionCall;
      console.log(`Simulator Sandbox: Tool call triggered: "${funcName}" with args:`, args);

      let functionResponseData: any = {};

      if (funcName === "check_lead_status") {
        const lookup = args.email_or_phone?.trim();
        if (lookup) {
          const supabase = await createAdminClient();
          const { data: leadData } = await supabase
            .from("lead_capture_leads")
            .select("*")
            .or(`email.eq.${lookup},phone.eq.${lookup}`)
            .limit(1);

          if (leadData && leadData.length > 0) {
            functionResponseData = {
              found: true,
              name: leadData[0].name,
              email: leadData[0].email,
              phone: leadData[0].phone,
              status: leadData[0].status || "Captured",
              created_at: leadData[0].created_at
            };
          } else {
            functionResponseData = {
              found: false,
              message: `No booking records or leads found for "${lookup}".`
            };
          }
        } else {
          functionResponseData = { found: false, message: "No email or phone number was provided." };
        }
      } else if (funcName === "get_store_products") {
        functionResponseData = {
          store_url: "https://ebook.unboundyou.com/storeproduct",
          products: [
            { name: "Physics Formula eBook", price: "₹99", description: "Contains all essential formulas for IGCSE Physics." },
            { name: "Physics Master Revision eBook", price: "₹299", description: "Complete notes and practice questions." },
            { name: "Chemistry Master Revision eBook", price: "₹299", description: "All core concepts for IGCSE Chemistry." },
            { name: "Biology Master Revision eBook", price: "₹299", description: "IGCSE Biology notes and exam-style solutions." },
            { name: "Science Master Revision Combo", price: "₹699", description: "Combo pack of Physics, Chemistry, and Biology eBooks." }
          ]
        };
      }

      // follow up request
      const followUpRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            ...chatHistory,
            {
              role: "model",
              parts: [{ functionCall: { name: funcName, args } }]
            },
            {
              role: "function",
              parts: [{
                functionResponse: {
                  name: funcName,
                  response: { output: functionResponseData }
                }
              }]
            }
          ],
          generationConfig: apiPayload.generationConfig,
          systemInstruction: apiPayload.systemInstruction,
        }),
      });

      if (!followUpRes.ok) {
        const errData = await followUpRes.json();
        throw new Error(errData.error?.message || "Tool execution feedback failed in Gemini");
      }

      const followUpResult = await followUpRes.json();
      const followUpParts = followUpResult.candidates?.[0]?.content?.parts || [];
      reply = followUpParts
        .filter((part: any) => !part.thought)
        .map((part: any) => part.text || "")
        .join("")
        .trim();
    } else {
      const candidateParts = result.candidates?.[0]?.content?.parts || [];
      reply = candidateParts
        .filter((part: any) => !part.thought)
        .map((part: any) => part.text || "")
        .join("")
        .trim();
    }

    if (!reply) {
      throw new Error("No response content generated from Gemini.");
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Chatbot Test Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal testing failure" },
      { status: 500 }
    );
  }
}
