/** Future server-side adapter contract. No webhook is configured or called in M1. */
export type AutomationEvent = {
  id: string;
  version: 1;
  occurredAt: string;
  kind: "group.created" | "join_request.approved" | "project.created";
  /** References only; workers must authorize any additional data access. */
  subject: { groupId: string; projectId?: string; requestId?: string };
};

export interface AutomationQueue {
  /** Enqueue after database commit; deduplicate by event.id, retry outside user transactions. */
  enqueue(
    event: AutomationEvent,
  ): Promise<{ deliveryId: string; state: "queued" }>;
}
