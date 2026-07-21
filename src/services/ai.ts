import { createAdminClient } from "@/lib/supabase/server";
import { sendWhatsAppText } from "./meta";

export async function generateChatbotResponse(workspaceId: string, phone: string, incomingMessage: string, contactId: string) {
  try {
    const supabase = await createAdminClient();

    // 1. Fetch chatbot settings
    const { data: settings, error: settingsError } = await supabase
      .from("chatbot_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .limit(1)
      .single();

    if (settingsError || !settings) {
      console.log("Chatbot: settings not found or error:", settingsError);
      return { success: false, error: "Settings not configured" };
    }

    if (!settings.is_enabled) {
      console.log("Chatbot: disabled in settings");
      return { success: false, error: "Chatbot is disabled" };
    }

    const apiKey = settings.gemini_api_key || process.env.GEMINI_API_KEY;
    const groqKey = settings.groq_api_key || process.env.GROQ_API_KEY;

    if (!apiKey && !groqKey) {
      console.error("Chatbot: Both Gemini and Groq API Keys are missing. Configure them in settings.");
      return { success: false, error: "API Keys missing" };
    }

    // 2. Fetch last 6 messages (pruning context history for cost optimization)
    const { data: rawMessages, error: msgError } = await supabase
      .from("messages")
      .select("direction, content, sent_at")
      .eq("contact_id", contactId)
      .order("sent_at", { ascending: false })
      .limit(6);

    if (msgError) {
      console.error("Chatbot: failed to fetch conversation history:", msgError);
    }

    // Map database history to Google Gemini API schema (User vs Model roles)
    const chatHistory: { role: "user" | "model"; parts: { text: string }[] }[] = [];

    if (rawMessages && rawMessages.length > 0) {
      // Reverse history to chronological order (ascending by sent_at)
      const sortedHistory = [...rawMessages].reverse();
      
      for (const msg of sortedHistory) {
        if (!msg.content) continue;
        chatHistory.push({
          role: msg.direction === "inbound" ? "user" : "model",
          parts: [{ text: msg.content }],
        });
      }
    } else {
      // Fallback: If no history is logged yet, push current incoming message
      chatHistory.push({
        role: "user",
        parts: [{ text: incomingMessage }],
      });
    }

    console.log(`Chatbot: calling Gemini API for contact ${contactId} with history of ${chatHistory.length} messages.`);

    // Check Google Gemini prompt context cache details
    const { getOrUpdatePromptCache } = await import("./gemini-cache");
    const cacheResourceName = apiKey ? await getOrUpdatePromptCache(supabase, settings, apiKey) : null;

    // Define available tools (Gemini Function Declarations)
    const functionDeclarations: any[] = [];
    if (settings.is_lead_tool_enabled) {
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

    if (settings.is_store_tool_enabled) {
      functionDeclarations.push({
        name: "get_store_products",
        description: "Retrieves the revision ebooks store catalog listing titles, descriptions, pricing, and purchase links.",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      });
    }

    // Build generation config and body to limit billing costs
    const apiPayload: Record<string, any> = {
      contents: chatHistory,
      generationConfig: {
        maxOutputTokens: 1024, // Increase token cap to accommodate reasoning/thinking tokens without truncating output
        temperature: 0.7,
      }
    };

    if (functionDeclarations.length > 0) {
      apiPayload.tools = [{ functionDeclarations }];
    }

    if (cacheResourceName) {
      apiPayload.cachedContent = cacheResourceName;
    } else {
      apiPayload.systemInstruction = {
        parts: [{ text: settings.system_prompt }],
      };
    }

    let replyText = "";
    const useGroqDirectly = !apiKey && groqKey;

    if (useGroqDirectly) {
      console.log("Chatbot: Gemini API Key is missing. Falling back to Groq directly.");
      replyText = await generateGroqResponse(chatHistory, settings.system_prompt, groqKey);
    } else {
      try {
        // 3. Make Gemini 2.5 Flash API HTTP request
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(apiPayload),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini API error (${res.status}): ${errText}`);
        }

        const result = await res.json();
        const firstPart = result.candidates?.[0]?.content?.parts?.[0];

        // Check if the model triggered a tool call
        if (firstPart && firstPart.functionCall) {
          const { name: funcName, args } = firstPart.functionCall;
          console.log(`Chatbot Agent: Gemini requested functionCall "${funcName}" with args:`, args);

          let functionResponseData: any = {};

          if (funcName === "check_lead_status") {
            const lookup = args.email_or_phone?.trim();
            if (lookup) {
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

          console.log("Chatbot Agent: Tool execution result:", functionResponseData);

          // Perform follow-up request to Gemini containing function call results
          const followUpPayload: Record<string, any> = {
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
          };

          if (cacheResourceName) {
            followUpPayload.cachedContent = cacheResourceName;
          } else {
            followUpPayload.systemInstruction = apiPayload.systemInstruction;
          }

          const followUpRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(followUpPayload),
          });

          if (!followUpRes.ok) {
            const errText = await followUpRes.text();
            throw new Error(`Gemini tool follow-up API error (${followUpRes.status}): ${errText}`);
          }

          const followUpResult = await followUpRes.json();
          const followUpParts = followUpResult.candidates?.[0]?.content?.parts || [];
          replyText = followUpParts
            .filter((part: any) => !part.thought)
            .map((part: any) => part.text || "")
            .join("")
            .trim();
        } else {
          // Normal text generation
          const candidateParts = result.candidates?.[0]?.content?.parts || [];
          replyText = candidateParts
            .filter((part: any) => !part.thought)
            .map((part: any) => part.text || "")
            .join("")
            .trim();
        }

        if (!replyText) {
          throw new Error("Gemini returned an empty or invalid response.");
        }
      } catch (geminiError: any) {
        console.warn("Chatbot: Gemini generation failed:", geminiError.message || geminiError);
        if (groqKey) {
          console.log("Chatbot: Falling back to Groq due to Gemini error...");
          replyText = await generateGroqResponse(chatHistory, settings.system_prompt, groqKey);
        } else {
          throw geminiError;
        }
      }
    }

    console.log(`Chatbot: AI response generated: "${replyText.slice(0, 50)}..."`);

    // 4. Send response on WhatsApp
    const { ok, wamid, error: waError } = await sendWhatsAppText(workspaceId, phone, replyText);

    // 5. Log chatbot outbound message in database messages history
    await supabase.from("messages").insert({
      contact_id: contactId,
      wamid: wamid || null,
      direction: "outbound",
      content: replyText,
      status: ok ? "sent" : "failed",
      sent_at: new Date().toISOString(),
    });

    // Update contacts table message statistics & last_message_at timestamp
    await supabase
      .from("contacts")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", contactId);

    await supabase.rpc("increment_message_count", { contact_id: contactId });

    if (!ok) {
      throw new Error(waError || "Failed to send WhatsApp message");
    }

    return { success: true, response: replyText };
  } catch (err) {
    console.error("Chatbot: error in generateChatbotResponse:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function generateGroqResponse(
  chatHistory: { role: "user" | "model"; parts: { text: string }[] }[],
  systemPrompt: string,
  groqKey: string
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    ...chatHistory.map((h) => ({
      role: h.role === "model" ? "assistant" : "user",
      content: h.parts[0]?.text || "",
    })),
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error("Groq returned empty response");
  }
  return reply;
}
