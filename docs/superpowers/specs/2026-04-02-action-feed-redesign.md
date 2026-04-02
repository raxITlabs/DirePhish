# Action Feed Redesign — Platform-Native Skins

## Context

The pipeline detail panel's action feed renders all actions (Slack messages, emails, thread replies, injects, arbiter events) with the same card layout, differentiated only by a colored left border. This makes it hard to track communication flow during incident simulations. Users can't quickly distinguish formal email communications from real-time Slack coordination.

## Scope

Pipeline view only (`PipelineSimulationPanel.tsx`). The standalone simulation page (`/simulation/[simId]`) already has separate renderers and is out of scope.

## Design

### Slack Messages (dark theme)
- Dark background (`#1a1a2e`) with rounded corners
- Square avatar (initials, role-colored) + agent name + role badge + timestamp
- Channel shown as `# channel-name` badge
- Message text in light gray, left-aligned under the name
- Thread replies: indented 20px, smaller avatar, `↳` prefix, left border connecting to parent

### Email Messages (light card)
- White card on cream/muted background with subtle border
- Header section: circular avatar + agent name + role, To/Cc fields, subject line bold
- Body section: proper paragraph formatting, darker text
- Reply emails: indented with colored left border, compact header showing `Re: Subject`

### Threat Actor Actions
- Dark background with red left border and red-tinted overlay
- Red-colored name, italic message text, `c2-channel` badge

### Inject Events
- Amber/orange banner card, `⚠ INJECT` label
- MITRE technique tag (e.g., `T1195.002 · INITIAL_ACCESS`)
- Description text in warm brown

### Arbiter/Scenario Events
- Teal card, `~ SCENARIO` label with decision (Continue/Halt)
- Description in teal-tinted text

### Tab Behavior

**Slack tab:** Only Slack-styled entries, grouped by channel
**Email tab:** Only email-styled cards
**All tab:** Mixed stream, each entry keeps its platform skin. Slack sections have dark background, email sections have white cards. They alternate naturally.
**Timeline tab:** Vertical rail with timeline dots. Each entry gets a compact version of its platform skin. Round dividers with amber dots. Inject events break the flow with amber banners.

### Timeline Dots (color-coded)
- Blue: SOC/security roles
- Orange: CISO/executive
- Brown: Legal/compliance
- Red: Threat actor
- Teal: Arbiter/scenario
- Amber: Inject events

## Files to Modify

- `frontend/app/components/pipeline/PipelineSimulationPanel.tsx` — main file, replace ActionFeed and TimelineView render functions

## What Stays the Same

- Tab filtering logic (All/Slack/Email/Timeline)
- Action data model (AgentAction type)
- Role color mapping (ROLE_COLORS)
- Expand/collapse for long messages
- Auto-scroll behavior
- `getActionContent()` helper

## Verification

1. Run a completed pipeline, click Simulations — verify Slack messages have dark theme
2. Click Email tab — verify email cards with headers
3. Click All tab — verify mixed stream with platform skins
4. Click Timeline — verify vertical rail with platform-native entries
5. Check inject events and arbiter events render correctly in all tabs
6. Check threat actor styling in all tabs
7. Verify thread replies show indentation
