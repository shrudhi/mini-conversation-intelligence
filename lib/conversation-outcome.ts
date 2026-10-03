type PriorityLike = {
  level: string;
  recommendedNextStep: string;
  decisionHint: string;
};

export function outcomeFromConversation(input: {
  verified?: boolean;
  ticketId?: string | null;
  ticketType: string | null;
  pendingAction: string | null;
  turnCount: number;
  priority: PriorityLike;
}): { nextStep: string; decision: string; priorityNote: string } {
  const ticketLabel = input.ticketType ? input.ticketType.replaceAll("_", " ") : "support";

  if (input.ticketId || input.ticketType) {
    const id = input.ticketId ? ` ${input.ticketId}` : "";
    return {
      nextStep: `Track open ${ticketLabel} ticket${id}. Follow up with the customer until the desk confirms progress.`,
      decision: `${ticketLabel} ticket${id ? ` ${input.ticketId}` : ""} on file`,
      priorityNote: `${input.priority.level} handled with an approved support action.`,
    };
  }
  if (input.pendingAction) {
    const action = input.pendingAction.replaceAll("_", " ");
    return {
      nextStep: `Customer was informed about ${action}. Confirm only if they still want the ticket, then track it here.`,
      decision: `Awaiting approval for ${action}`,
      priorityNote: `${input.priority.level} action proposed, not yet confirmed.`,
    };
  }
  if (input.turnCount === 0) {
    return {
      nextStep: input.priority.recommendedNextStep,
      decision: "Conversation not started",
      priorityNote: `${input.priority.level} · ${input.priority.decisionHint}`,
    };
  }
  return {
    nextStep: input.priority.recommendedNextStep,
    decision: "Explained with signed-in case facts · no ticket required yet",
    priorityNote: `${input.priority.level} stayed inside guided self-serve handling.`,
  };
}
