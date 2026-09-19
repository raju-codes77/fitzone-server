const Groq = require("groq-sdk");

let groq = null;

const getGroqClient = () => {
  if (!groq && process.env.GROQ_API_KEY) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
};

const generateConversationalResponse = async (messages) => {
  const client = getGroqClient();
  if (!client) {
    throw new Error("Groq API key is not configured.");
  }

  try {
    const chatCompletion = await client.chat.completions.create({
      messages: messages,
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
      stream: false,
    });
    
    return chatCompletion.choices[0]?.message?.content || "";
  } catch (error) {
    if (error.status === 400 || error.message?.includes("model_decommissioned")) {
      console.error("[Groq] Model decommissioned or invalid configuration.");
    }
    const err = new Error("Failed to generate AI response. Please try again later.");
    err.status = 503;
    throw err;
  }
};

const generateStructuredFallback = async (systemInstruction, prompt) => {
  const client = getGroqClient();
  if (!client) {
    throw new Error("Groq API key is not configured.");
  }

  try {
    // Explicitly instruct Groq to output JSON only
    const jsonInstruction = `${systemInstruction}\nIMPORTANT: You must return ONLY valid JSON. Do not include markdown formatting like \`\`\`json.`;
    
    const chatCompletion = await client.chat.completions.create({
      messages: [
        { role: "system", content: jsonInstruction },
        { role: "user", content: prompt }
      ],
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_tokens: 2048,
    });
    
    const jsonString = chatCompletion.choices[0]?.message?.content || "{}";
    return JSON.parse(jsonString);
  } catch (error) {
    if (error.status === 400 || error.message?.includes("model_decommissioned")) {
      console.error("[Groq] Model decommissioned or invalid configuration.");
    } else {
      console.error("[Groq Structured AI Error]", error.message || error);
    }
    const err = new Error("Failed to generate AI plan via fallback.");
    err.status = 503;
    throw err;
  }
};

module.exports = {
  generateConversationalResponse,
  generateStructuredFallback
};
