import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { google } from "@ai-sdk/google";
import { createFacilityTools } from "@/lib/gemini-tools";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: facilityId } = await params;
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: google("gemini-3.5-flash"),
    system:
      "You answer spatial and status questions about a single Facility using the provided tools. Always call a tool to get exact data before answering a question about distance, status, or contents — never guess or estimate. If a tool returns an error or no matches, say so plainly and suggest the user check the item's name on the Floor Plan. Keep answers short and direct.",
    messages: await convertToModelMessages(messages),
    tools: createFacilityTools(facilityId),
    stopWhen: stepCountIs(5),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
