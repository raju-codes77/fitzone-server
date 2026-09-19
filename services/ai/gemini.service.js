const { GoogleGenAI } = require("@google/genai");

let ai = null;

const getGeminiClient = () => {
  if (!ai && process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
};

const generateStructuredPlan = async (systemInstruction, prompt) => {
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini API key is not configured.");
  }

  try {
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });
    
    // Parse the structured JSON response
    const jsonString = response.text;
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Gemini AI Error:", error);
    
    // Check for quota/429 errors
    if (
      error.status === 429 || 
      (error.message && (error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED") || error.message.includes("free_tier_requests")))
    ) {
      const err = new Error("AI service is temporarily unavailable. Please try again later.");
      err.code = "AI_QUOTA_EXCEEDED";
      err.status = 429;
      throw err;
    }

    throw new Error("Failed to generate AI plan. Please try again later.");
  }
};

const generateConversational = async (systemInstruction, messages) => {
  const client = getGeminiClient();
  if (!client) throw new Error("Gemini API key is not configured.");

  try {
    // Format messages for Gemini SDK
    // SDK format: { role: 'user' | 'model', parts: [{ text: '' }] }
    const formattedHistory = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }]
    }));

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedHistory,
      config: {
        systemInstruction,
      },
    });
    
    return response.text;
  } catch (error) {
    console.error("Gemini Conversational AI Error:", error);
    if (error.status === 429 || (error.message && (error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED")))) {
      const err = new Error("AI service is temporarily unavailable.");
      err.code = "AI_QUOTA_EXCEEDED";
      err.status = 429;
      throw err;
    }
    throw new Error("Failed to generate AI response.");
  }
};

module.exports = {
  generateStructuredPlan,
  generateConversational
};
