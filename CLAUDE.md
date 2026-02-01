# CLAUDE.md - AI Assistant Guide for SkirmishBot

## Project Overview

SkirmishBot is a Discord bot for managing competitive esports tournaments with a ticket-based economy system. It supports 1v1 and 2v2 game modes, real-money payments via Stripe, and skill-based matchmaking across four competitive tiers.

**Core Features:**
- Tournament queue system with 4 tiers (T1, T5, T10, T20)
- Automatic bracket generation (4 or 8 player brackets)
- Ticket-based economy with Stripe payment integration
- 1v1 and 2v2 competitive modes
- Player statistics and leaderboards
- Real money payouts (20% platform rake)

## Tech Stack

- **Runtime:** Node.js
- **Discord:** discord.js v14.23.2
- **Database:** MongoDB via Mongoose v8.19.1
- **Payments:** Stripe v19.1.0
- **Web Server:** Express v5.1.0 (for Stripe webhooks)
- **Dev Tools:** ESLint v9.37.0
- **Tunneling:** ngrok (for local webhook development)

## Directory Structure

```
/commands/          # Discord slash command handlers
/models/            # Mongoose schemas for MongoDB
/services/          # Business logic layer
/events/            # Discord event handlers (ready, interactionCreate)
/components/        # UI panels (embeds, buttons)
/config/            # Configuration (tiers, constants, ticket bundles)
/jobs/              # Background schedulers
index.js            # Main bot entry point
stripeWebhook.js    # Stripe webhook server (runs separately)
deploy-commands.js  # Script to register slash commands with Discord
```

## Quick Start Commands

```bash
# Install dependencies
npm install

# Deploy slash commands to Discord
node deploy-commands.js

# Run the main bot
node index.js

# Run Stripe webhook server (separate terminal)
node stripeWebhook.js
```

## Required Environment Variables

Create a `.env` file with:

```
DISCORD_TOKEN=         # Bot authentication token
CLIENT_ID=             # Discord application ID
GUILD_ID=              # Target Discord server ID
MONGODB_SRV=           # MongoDB connection string
STRIPE_SECRET_KEY=     # Stripe API secret key
STRIPE_WEBHOOK_SECRET= # Stripe webhook signature verification
TOURNEY_CATEGORY_ID=   # Discord category for tournament channels
MATCH_CATEGORY_ID=     # Discord category for match channels
QUEUE_CHANNEL_ID=      # Channel for queue panel
TICKET_CHANNEL_ID=     # Channel for ticket purchases
WALLET_CHANNEL_ID=     # Channel for wallet/payout panel
WEBHOOK_PORT=          # Stripe webhook port (default: 3000)
```

## Code Conventions

### File Naming
- Commands: kebab-case (e.g., `admin-payouts.js`, `force-start.js`)
- Models: PascalCase (e.g., `PlayerStats.js`, `Tournament.js`)
- Services: camelCase with "Service" suffix (e.g., `queueService.js`)
- Components: camelCase with "Panel" suffix (e.g., `queuePanel.js`)

### Function Naming
- Functions: camelCase (e.g., `checkAndFormBracket`, `createMatchChannel`)
- Constants: UPPER_SNAKE_CASE (e.g., `MIN_START`, `BRACKET_STATES`)

### Command Structure
Commands export an object with `data` (SlashCommandBuilder) and `execute` function:
```javascript
module.exports = {
  data: new SlashCommandBuilder()
    .setName("command-name")
    .setDescription("Command description"),
  async execute(interaction) {
    // Command logic
  }
};
```

### Reply Patterns
- Use ephemeral replies for user-specific responses: `{ ephemeral: true }`
- Defer long operations: `await interaction.deferReply({ ephemeral: true })`
- Edit deferred replies: `await interaction.editReply(message)`

### Database Patterns
- Discord IDs stored as strings
- Use `serverId` for multi-server support
- Common index patterns: `{ serverId, userId }`, `{ serverId, tierKey }`

## Architecture Patterns

### Service Layer
All business logic lives in `/services/`. Commands call services, services interact with models.

```javascript
// Command -> Service -> Model
const { join, leave } = require("../services/queueService");
const res = await join(serverId, userId, tierKey);
```

### Key Services
- `queueService.js` - Queue join/leave, bracket formation
- `queue2v2Service.js` - 2v2 queue operations
- `tournamentService.js` - 1v1 bracket creation, match channels
- `tournament2v2Service.js` - 2v2 bracket operations
- `bracketService.js` - Bracket visualization
- `statsService.js` - Player statistics updates
- `stripeService.js` - Payment processing

### Scheduler Jobs
Background jobs in `/jobs/` run every 10 seconds:
- `queueScheduler.js` - Checks queue windows, forms brackets
- `queue2v2Scheduler.js` - 2v2 equivalent

### Event Flow
1. User interaction triggers `/events/InteractionCreate.js`
2. Command handler in `/commands/` processes the request
3. Service in `/services/` executes business logic
4. Model in `/models/` persists to MongoDB
5. Component in `/components/` updates UI panels

## Key Models

| Model | Purpose |
|-------|---------|
| `profileSchema.js` | User tickets & winnings balance |
| `PlayerStats.js` | Wins, earnings, streaks |
| `Tournament.js` | Bracket state, players, tier |
| `Match.js` | Individual matches in tournaments |
| `QueueEntry.js` | 1v1 queue entries |
| `QueueEntry2v2.js` | 2v2 queue entries |
| `Team.js` | 2v2 team info (leader, partner) |
| `TicketPurchase.js` | Purchase history |
| `PayoutRequest.js` | Withdrawal requests |

## Tournament Tier System

```javascript
T1:  1 ticket entry   // Beginner tier
T5:  5 tickets entry  // Intermediate tier
T10: 10 tickets entry // Advanced tier
T20: 20 tickets entry // Expert tier
```

Queue Policy:
- Window opens when 4+ players join a tier
- After 2 minutes: start with 8 players if available, else 4
- 20% platform rake on all prize pools

## Common Development Tasks

### Adding a New Command
1. Create file in `/commands/` with kebab-case name
2. Export object with `data` and `execute`
3. Run `node deploy-commands.js` to register

### Adding a New Model
1. Create schema in `/models/` with PascalCase name
2. Define indexes for common queries
3. Export with `mongoose.model()`

### Modifying Queue Logic
- Queue eligibility: `queueService.js` -> `join()`
- Bracket formation: `queueService.js` -> `checkAndFormBracket()`
- Scheduler timing: `/jobs/queueScheduler.js`

### Updating Tier Configuration
Edit `/config/tiers.js` for costs and queue policy settings.

## State Constants

Located in `/config/constants.js`:
```javascript
BRACKET_STATES: { PENDING, ACTIVE, COMPLETE }
MATCH_STATES: { PENDING, ACTIVE, REPORTED, COMPLETE }
```

## Important Implementation Details

### Player Queue Restrictions
- Players in active tournaments cannot queue for new ones
- Tickets are charged when tournament starts (not when joining queue)
- Players must have sufficient ticket balance to queue

### 2v2 Team System
- Teams have a leader and partner
- Invite system for team formation
- Auto-pairing fallback for incomplete teams

### Match Channels
- Private channels created per match
- Automatic permission restrictions to participants
- Cleaned up after tournament completion

## Testing

No test framework currently configured. The `npm test` script is a placeholder.

Recommended testing areas:
- Queue join/leave logic
- Bracket formation with edge cases
- Payment flow mocking
- State transition validation

## Debugging Commands

- `/ping` - Health check
- `/why-cant-queue` - Debug queue eligibility issues
- `/queue status` - Show current queue counts
- `/balance` - Check ticket balance

## Admin Commands

- `/admin-tickets` - Manage user tickets
- `/admin-payouts` - Process withdrawal requests
- `/admin-forfeit` - Force forfeit a match
- `/admin-clear-leaderboard` - Reset leaderboard
- `/force-start` - Manually trigger tournament start
- `/reset-economy` - Reset ticket economy
- `/reset-tournaments` - Clear tournament data
- `/reset-2v2` - Clear 2v2 data
