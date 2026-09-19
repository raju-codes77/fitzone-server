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
      model: "llama3-8b-8192", // Using Llama 3 8b for fast, low-latency conversation
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
      stream: false,
    });
    
    return chatCompletion.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("Groq AI Error:", error);
    throw new Error("Failed to generate AI response. Please try again later.");
  }
};

const generateStructuredFallback = async (systemInstruction, prompt) => {
  const client = getGroqClient();
  if (!client) {
    throw new Error("Groq API key is not configured.");
  }

  try {
    const chatCompletion = await client.chat.completions.create({
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      model: "llama3-8b-8192",
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_tokens: 2048,
    });
    
    const jsonString = chatCompletion.choices[0]?.message?.content || "";
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Groq Structured AI Error:", error);
    throw new Error("Failed to generate AI plan via fallback.");
  }
};

module.exports = {
  generateConversationalResponse,
  generateStructuredFallback
};
