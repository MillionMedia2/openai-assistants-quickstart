import { assistantId } from "@/app/assistant-config";
import { openai } from "@/app/openai";

export const runtime = "nodejs";

// Send a new message to a thread
export async function POST(request: Request, { params: { threadId } }) {
    const { content } = await request.json();

    try {
        // 1. Create the message
        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: content,
        });

        // 2. Create a run
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId,
        });

        // 3. Wait for the run to complete
        let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        while (runStatus.status !== "completed" && runStatus.status !== "failed" && runStatus.status !== "cancelled" && runStatus.status !== "expired") {
            // Wait for 500ms
            await new Promise(resolve => setTimeout(resolve, 500));
            runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        }

        // 4. Handle failure states
        if (runStatus.status === "failed" || runStatus.status === "cancelled" || runStatus.status === "expired") {
            console.error("Run failed with status:", runStatus.status);
            return new Response(JSON.stringify({ error: `Run failed with status: ${runStatus.status}` }), {
                status: 500,
                headers: {
                    "Content-Type": "application/json"
                }
            });
        }

        // 5. Get the last message from the assistant
        const messages = await openai.beta.threads.messages.list(threadId, { order: "asc" });
        const assistantMessage = messages.data
            .filter((m) => m.role === "assistant")
            .pop();

        // 6. Return the content of the last message
        if (assistantMessage) {
            // Check if assistantMessage.content exists and is an array
            if (assistantMessage.content && Array.isArray(assistantMessage.content) && assistantMessage.content.length > 0) {
                // Extract the text content, handling different content types
                let textContent = "";
                for (const contentItem of assistantMessage.content) {
                    if (contentItem.type === "text") {
                        textContent += contentItem.text.value || "";
                    } else if (contentItem.type === "image_file") {
                        // Handle image file content if needed
                        textContent += `[Image: ${contentItem.image_file.file_id}]`; // Example placeholder
                    }
                }
                return new Response(JSON.stringify({
                    content: textContent || "", // Use textContent if it exists, otherwise use an empty string
                    event: "thread.run.completed"
                }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json"
                    }
                });
            } else {
                console.warn("Assistant message content is empty or not in expected format.");
                return new Response(JSON.stringify({
                    content: "I am unable to provide a response at this time",
                    event: "thread.run.completed"
                }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json"
                    }
                });
            }
        } else {
            return new Response(null, { status: 204 }); // No content
        }
    } catch (error: any) {
        console.error("Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            }
        });
    }
}