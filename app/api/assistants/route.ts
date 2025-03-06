import { openai } from "@/app/openai";

export const runtime = "nodejs";

// Create a new assistant
export async function POST() {
  const assistant = await openai.beta.assistants.create({
    instructions: "You are a helpful assistant. When answering questions, please use the File Search tool to find relevant information in the documents provided.",
    name: "Plantz Agent",
    model: "gpt-4o-mini",
    tools: [
      { type: "code_interpreter" },
      { type: "file_search" },
    ],
    tool_resources: {
      file_search: {
        vector_store_ids: ["vs_67a669ee3c408191b5588e966f605592"]
      }
    },
  });
  return Response.json({ assistantId: assistant.id });
}
