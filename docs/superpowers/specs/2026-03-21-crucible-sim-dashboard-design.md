# Crucible Simulation Dashboard Enhancement Design Spec

**Goal:** Enhance the simulation dashboard with per-world stats, action type badges, agent activity summary, and improved timeline — using only existing backend endpoints.

**Sub-project:** 4 of 5 (Foundation ✅ → Report ✅ → Graph ✅ → **Sim Dashboard** → History)

---

## Enhancements

### 1. World Stats Bar
New horizontal bar below the pressure strip showing per-world statistics:
- Per world (Slack, Email): action count, latest round with activity
- Computed client-side from existing `actions` array
- Uses Badge + small stat cards

### 2. Action Type Badges
Add colored badges to actions in SlackWorld, EmailWorld, and TimelineView:
- `send_message` → Badge "Message" (default)
- `reply_in_thread` → Badge "Thread Reply" (secondary)
- `send_email` → Badge "Email" (default)
- `reply_email` → Badge "Reply" (secondary)
- Other actions → Badge with action name (outline)

### 3. Agent Activity Summary
New component showing per-agent message counts, computed from actions:
- Collapsible panel in the right side or as a tab
- Agent name, role, message count, last active round
- Sorted by message count descending
- Uses Card, Badge

### 4. Enhanced Timeline
Improve TimelineView with:
- World icon badges (Slack icon, Email icon) using Lucide
- Action type badges
- Better visual grouping by round
- Agent role badge next to name

### 5. Round Filtering
Add a "Load Earlier Rounds" button that uses the existing `?from_round=` parameter:
- Initially load only last 3 rounds of actions (reduces initial load)
- "Load Earlier" button fetches older rounds
- Keeps newest-first ordering

### 6. Simulation Stats in Status Bar
Add to the existing status bar:
- Total action count
- Active agent count (unique agents in actions)
- Elapsed time since simulation start

---

## Files

### New Files
- `frontend/app/components/simulation/WorldStats.tsx` — per-world stats bar
- `frontend/app/components/simulation/AgentSummary.tsx` — per-agent activity summary

### Modified Files
- `frontend/app/simulation/[simId]/page.tsx` — add WorldStats, agent summary tab
- `frontend/app/components/simulation/SlackWorld.tsx` — add action type badges
- `frontend/app/components/simulation/EmailWorld.tsx` — add action type badges
- `frontend/app/components/simulation/TimelineView.tsx` — add world icons, action badges, agent role badges
- `frontend/app/components/simulation/WorldTabs.tsx` — add AgentSummary as 4th tab

---

## Success Criteria

1. WorldStats bar shows per-world action counts
2. Action type badges appear on all messages/emails
3. Agent summary tab shows per-agent activity
4. Timeline has world icons and action type badges
5. `pnpm build` succeeds
