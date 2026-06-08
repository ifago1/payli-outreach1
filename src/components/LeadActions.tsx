"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const STATUSES = [
  "NEW",
  "ENRICHING",
  "TO_CONTACT",
  "CONTACTED",
  "IN_CONVERSATION",
  "PROPOSAL_SENT",
  "WON",
  "LOST",
  "DO_NOT_CONTACT",
];

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

export function LeadActions({
  leadId,
  currentStatus,
  currentPriority,
}: {
  leadId: string;
  currentStatus: string;
  currentPriority: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(currentStatus);
  const [priority, setPriority] = useState(currentPriority);

  function update(next: { status?: string; priority?: string }) {
    startTransition(async () => {
      const res = await fetch(`/api/leads/${leadId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex gap-2 items-center">
      <select
        value={status}
        disabled={pending}
        onChange={(e) => {
          setStatus(e.target.value);
          update({ status: e.target.value });
        }}
        className="input w-44"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={priority}
        disabled={pending}
        onChange={(e) => {
          setPriority(e.target.value);
          update({ priority: e.target.value });
        }}
        className="input w-32"
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
}
