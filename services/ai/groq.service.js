const Groq = require("groq-sdk");

let groq = null;

const getGroqClient = () => {
  if (!process.env.GROQ_API_KEY) {
    const err = new Error("Groq API key is missing.");
    err.code = "AI_API_KEY_MISSING";
    err.status = 500;
    throw err;
  }
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
};

const handleGroqError = (error, isParseError = false, rawString = "") => {
  const modelUsed = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
  let errType = "Unknown";
  
  if (error.status === 429) errType = "Rate Limit";
  else if (error.status === 400) errType = "Invalid Request";
  else if (error.status === 401) errType = "Auth Failure";
  else if (error.status === 403) errType = "Permission Failure";
  else if (error.status === 404) errType = "Model Not Found";
  else if (error.status >= 500) errType = "Provider Error";
  else if (isParseError) errType = "JSON Parse Error";

  const retryAfter = error.response?.headers?.['retry-after'] || error.headers?.['retry-after'] || 'N/A';
  const remReq = error.response?.headers?.['x-ratelimit-remaining-requests'] || error.headers?.['x-ratelimit-remaining-requests'] || 'N/A';
  const remTokens = error.response?.headers?.['x-ratelimit-remaining-tokens'] || error.headers?.['x-ratelimit-remaining-tokens'] || 'N/A';

  console.error(
    `[Groq AI Error]\n` +
    `Model: ${modelUsed}\n` +
    `Status: ${error.status || 'N/A'}\n` +
    `Type: ${errType}\n` +
    `Code: ${error.code || 'N/A'}\n` +
    `Name: ${error.name || 'N/A'}\n` +
    `Message: ${error.message}\n` +
    `Retry-After: ${retryAfter}\n` +
    `Remaining Requests: ${remReq}\n` +
    `Remaining Tokens: ${remTokens}`
  );

  if (isParseError) {
    console.error(`[Groq JSON Parse Failure] Truncated output: ${rawString.substring(0, 500)}`);
  }

  const err = new Error();
  if (error.status === 429) {
    err.message = "AI generation is temporarily rate limited. Please try again shortly.";
    err.code = "AI_RATE_LIMITED";
    err.status = 429;
  } else if (error.status === 401) {
    err.message = "AI authentication failed.";
    err.code = "AI_AUTH_FAILED";
    err.status = 500;
  } else if (error.status === 403) {
    err.message = "AI permission denied.";
    err.code = "AI_PERMISSION_DENIED";
    err.status = 500;
  } else if (error.status === 404) {
    err.message = "AI model not found.";
    err.code = "AI_MODEL_NOT_FOUND";
    err.status = 500;
  } else if (error.status === 400) {
    err.message = "Invalid AI request.";
    err.code = "AI_INVALID_REQUEST";
    err.status = 400;
  } else if (isParseError) {
    err.message = "AI returned invalid structure.";
    err.code = "AI_INVALID_JSON";
    err.status = 500;
  } else {
    err.message = "Failed to generate AI response. Please try again later.";
    err.code = "AI_PROVIDER_ERROR";
    err.status = 503;
  }
  throw err;
};

const generateConversationalResponse = async (messages) => {
  const client = getGroqClient();

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
    handleGroqError(error);
  }
};

const generateStructuredFallback = async (systemInstruction, prompt) => {
  const client = getGroqClient();
  let jsonString = "";

  try {
    const jsonInstruction = `${systemInstruction}\nIMPORTANT: You must return ONLY valid JSON. Do not include markdown formatting like \`\`\`json.`;
    
    const chatCompletion = await client.chat.completions.create({
      messages: [
        { role: "system", content: jsonInstruction },
        { role: "user", content: prompt }
      ],
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      temperature: 0.1,
      max_tokens: 4096,
    });
    
    jsonString = chatCompletion.choices[0]?.message?.content || "{}";
    jsonString = jsonString.replace(/^```json/mi, "").replace(/```$/m, "").trim();
    return JSON.parse(jsonString);
  } catch (error) {
    if (error instanceof SyntaxError) {
      handleGroqError(error, true, jsonString);
    } else {
      handleGroqError(error);
    }
  }
};

module.exports = {
  generateConversationalResponse,
  generateStructuredFallback
};
