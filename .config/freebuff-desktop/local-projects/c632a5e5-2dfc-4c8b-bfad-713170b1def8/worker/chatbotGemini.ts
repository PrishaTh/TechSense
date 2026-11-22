/**
 * Gemini provider for the assistant.
 *
 * The brief asked for the Anthropic SDK with a "gemini 4.6" model; no such
 * Anthropic model exists, and the supplied key is a Google AI Studio key that
 * Anthropic rejects. This module keeps the same tools, system prompt and
 * read-only guarantees but talks to the Gemini API, so the assistant can
 * actually answer. Claude stays in use whenever ANTHROPIC_API_KEY is set.
 */
export type Turn = { role: "user" | "assistant"; content: string };

export type ToolSpec = {
  name: string;
  description: string;
  input_schema: {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
};

type GeminiPart = {
  text?: string;
  thought?: boolean;
  functionCall?: { name?: string; args?: Record<string, unknown> };
};

type GeminiContent = { role?: string; parts?: GeminiPart[] };

type GeminiReply = {
  candidates?: { content?: GeminiContent; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

const MAX_STEPS = 4;
const TIMEOUT_MS = 18_000;

function declarations(tools: readonly ToolSpec[]) {
  return tools.map((tool) => {
    const properties = Object.entries(tool.input_schema.properties ?? {});
    const declaration: Record<string, unknown> = {
      name: tool.name,
      description: tool.description,
    };
    if (properties.length) {
      declaration.parameters = {
        type: "OBJECT",
        properties: Object.fromEntries(
          properties.map(([key, value]) => [
            key,
            {
              type: (value.type ?? "string").toUpperCase(),
              ...(value.description ? { description: value.description } : {}),
            },
          ]),
        ),
        required: tool.input_schema.required ?? [],
      };
    }
    return declaration;
  });
}

export async function askGemini(options: {
  apiKey: string;
  model: string;
  system: string;
  history: Turn[];
  message: string;
  tools: readonly ToolSpec[];
  runTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
}): Promise<string> {
  const contents: { role: string; parts: unknown[] }[] = [
    ...options.history.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    })),
    { role: "user", parts: [{ text: options.message }] },
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    options.model,
  )}:generateContent`;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": options.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.system }] },
        contents,
        tools: [{ functionDeclarations: declarations(options.tools) }],
        generationConfig: { maxOutputTokens: 700, temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`gemini_${response.status}: ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as GeminiReply;
    const content = data.candidates?.[0]?.content;
    if (!content?.parts?.length) {
      throw new Error(
        `gemini_empty: ${data.promptFeedback?.blockReason ?? data.error?.message ?? "no content"}`,
      );
    }

    const calls = content.parts.filter((part) => part.functionCall?.name);
    if (!calls.length) {
      return content.parts
        .filter((part) => typeof part.text === "string" && !part.thought)
        .map((part) => part.text as string)
        .join("\n")
        .trim();
    }

    // Echo the model turn back verbatim (Gemini 2.5+ signs function calls).
    contents.push({ role: "model", parts: content.parts });

    const results: unknown[] = [];
    for (const call of calls) {
      const name = call.functionCall?.name as string;
      const args =
        call.functionCall?.args && typeof call.functionCall.args === "object"
          ? call.functionCall.args
          : {};
      let payload: unknown;
      try {
        payload = await options.runTool(name, args);
      } catch (cause) {
        console.error("chatbot_tool_error", name, cause);
        payload = { error: "That lookup failed. Tell the user the detail is unavailable." };
      }
      results.push({ functionResponse: { name, response: { result: payload } } });
    }
    contents.push({ role: "user", parts: results });
  }

  return "";
}
