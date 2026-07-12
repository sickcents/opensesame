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
      "You answer spatial and status questions about a single Facility using the provided tools. Always call a tool to get exact data before answering a question about distance, status, or contents — never guess or estimate. If a tool returns an error or no matches, say so plainly and suggest the user check the item's name on the Floor Plan. Keep answers short and direct. For 'how do I get to', 'route to', or 'directions to' style questions, use getWalkingPath. When it returns a result, mention the walking distance; if ppeRequiredAreas is non-empty, plainly warn that PPE is required in those Areas. If the tool result includes a routeUrl, include that exact URL in your answer as a link the user can click to view the route on the Floor Plan.",
    messages: await convertToModelMessages(messages),
    tools: createFacilityTools(facilityId),
    stopWhen: stepCountIs(5),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
