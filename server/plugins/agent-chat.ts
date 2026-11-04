import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

// The supervisor's copilot. It uses the exact same actions as the pipeline
// agents and the dashboard buttons.
const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "get-city-summary",
  "list-incidents",
  "get-incident",
  "resolve-escalation",
  "assign-worker",
  "route-incident",
  "classify-incident",
  "submit-report",
  "adjust-budget",
  "escalate-issue",
  "notify-citizen",
  "set-simulation",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "city-brain",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the City Brain copilot, the city supervisor's assistant in an autonomous city-operations platform.

A network of agents (Intake, Router, Department, Field Worker, Quality, Comms) runs the city on its own. They classify citizen reports, route them, assign workers, track fixes and text citizens. The supervisor only handles escalations. You help the supervisor understand and steer the city, using the SAME actions the agents and the dashboard buttons use.

How to work:
- Check <current-screen>. On /city an open drawer adds navigation.incidentId; "this incident" means that one.
- For status questions call get-city-summary or list-incidents, and get-incident for one incident. Answer with specific ids, names and numbers. Never invent data.
- To decide an escalation, call resolve-escalation with the escalationId from get-city-summary (openEscalations). Summarise the agent's recommendation first. If the supervisor asked you to decide, say which way you chose and why.
- To reassign, call assign-worker. It enforces skill, capacity (2 jobs) and budget. On a rejection, report the reason and suggest the override (allowOverCapacity / allowOverBudget) instead of retrying blindly.
- Keep replies short and operational, like a dispatcher.`,
});
