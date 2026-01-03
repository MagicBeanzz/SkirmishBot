# ToS Acceptance System Setup Guide

## Overview

The ToS acceptance system ensures all users agree to your Terms of Service before accessing SkirmishBot services. It integrates seamlessly with your existing ValoTracker rank verification.

---

## How It Works

### User Flow:
1. User joins Discord server
2. **ValoTracker** gives rank role (Iron, Bronze, etc.)
3. User sees **#tos-acceptance** channel
4. User clicks **"✅ I Accept the Terms of Service"** button
5. Bot gives **"ToS Accepted"** role
6. Bot logs acceptance in database (legal compliance)
7. User now has access to all service channels

### Access Requirements:
- Service channels require: **Rank Role + ToS Accepted Role**
- This creates a two-gate system:
  - Gate 1: ValoTracker verification (proves they're ranked)
  - Gate 2: ToS acceptance (legal protection)

---

## Setup Instructions

### Step 1: Create ToS Acceptance Channel

1. **Create a new text channel:** `#tos-acceptance`
2. **Set permissions:**
   - `@everyone`: Can view, cannot send messages
   - `SkirmishBot`: Can send messages, manage messages
3. **Copy the channel ID:**
   - Right-click channel → Copy Channel ID
   - (Enable Developer Mode in Discord Settings → Advanced if you don't see this)

### Step 2: Configure the Bot

**Edit `components/tosPanel.js`:**

Line 7:
```javascript
const TOS_CHANNEL_ID = "YOUR_TOS_CHANNEL_ID"; // Replace with actual channel ID
```

Replace with your channel ID:
```javascript
const TOS_CHANNEL_ID = "1234567890123456789"; // Your #tos-acceptance channel
```

Line 8 (Optional - customize role name):
```javascript
const TOS_ACCEPTED_ROLE_NAME = "ToS Accepted"; // Role to give upon acceptance
```

### Step 3: Update ToS Link

**Edit `components/tosPanel.js`:**

Line 27:
```javascript
"[View Full Terms of Service](https://github.com/YOUR_REPO/blob/main/TERMS_OF_SERVICE.md)"
```

Replace with your actual GitHub link or host the ToS on a website:
```javascript
"[View Full Terms of Service](https://github.com/YourUsername/SkirmishBot/blob/main/TERMS_OF_SERVICE.md)"
```

Or use a website:
```javascript
"[View Full Terms of Service](https://yourwebsite.com/terms)"
```

### Step 4: Lock Service Channels

For each service channel (queue, tournaments, etc.), update permissions:

**Current (Rank only):**
```
@everyone: ❌ View Channel
Iron Role: ✅ View Channel
Bronze Role: ✅ View Channel
... etc
```

**New (Rank + ToS):**
```
@everyone: ❌ View Channel
ToS Accepted Role: ✅ View Channel (REQUIRED)
Iron Role: ✅ View Channel
Bronze Role: ✅ View Channel
... etc
```

**Discord automatically requires ALL roles** - so users need BOTH:
- A rank role (from ValoTracker)
- ToS Accepted role (from SkirmishBot)

### Step 5: Restart Bot

```bash
node index.js
```

The bot will automatically:
- Create the ToS acceptance panel in `#tos-acceptance`
- Create the "ToS Accepted" role if it doesn't exist
- Start accepting user acceptances

---

## Channel Recommendations

### Recommended Channel Structure:

**Public (Everyone Can See):**
- `#welcome` - Server rules and welcome message
- `#tos-acceptance` - ToS acceptance panel (NEW)
- `#verify-rank` - ValoTracker verification

**Locked (Requires Rank + ToS Accepted):**
- `#general` - General chat
- `#queue` - Tournament queue panel
- `#prize-catalog` - Prize redemption panel
- `#leaderboard` - Leaderboard panel
- `#support` - Support tickets

**Admin Only:**
- `#admin-commands` - Admin panel
- `#logs` - Bot logs

---

## Testing the System

### Test Flow:

1. **Create a test account** (or use alt account)
2. **Join server** → Should only see public channels
3. **Get rank role from ValoTracker** → Still locked out of service channels
4. **Go to #tos-acceptance** → See the panel
5. **Click "Accept ToS" button** → Get "ToS Accepted" role
6. **Service channels unlock** → Can now access everything

### Verify Database Logging:

Check MongoDB to confirm acceptances are logged:
```javascript
db.tosacceptances.find()
```

Should show:
```json
{
  "userId": "123456789",
  "serverId": "987654321",
  "acceptedAt": "2026-01-03T...",
  "version": "1.0",
  "discordUsername": null
}
```

---

## Troubleshooting

### "ToS Accepted" role not created:
- Make sure bot has **Manage Roles** permission
- Bot's role must be **above** the "ToS Accepted" role in the hierarchy

### Panel not showing:
- Check `TOS_CHANNEL_ID` is correct in `tosPanel.js`
- Make sure bot has **Send Messages** permission in that channel
- Check console for errors

### Users can't see service channels after accepting:
- Verify channel permissions require BOTH roles
- Check if "ToS Accepted" role is properly assigned
- Make sure ValoTracker also gave them a rank role

### Button not working:
- Check bot is online
- Check console for errors
- Verify button handler is in `InteractionCreate.js`

---

## Legal Compliance

### Why This System Exists:

**Proof of Agreement:**
- Database logs prove user accepted ToS
- Logs include timestamp, user ID, server ID
- Helps defend against "I never agreed" claims

**Age Verification Reminder:**
- ToS requires 18+ age
- Acceptance implies they meet this requirement
- Not foolproof, but adds a legal layer

**Jurisdiction Acknowledgment:**
- Users confirm they checked local laws
- Shifts legal responsibility to user
- Important for skill-gaming platforms

### What Gets Logged:

```javascript
{
  userId: "Discord User ID",
  serverId: "Discord Server ID",
  acceptedAt: "Timestamp",
  version: "1.0", // ToS version they accepted
  ipAddress: null, // Discord doesn't provide this
  discordUsername: null // Optional to store
}
```

### Updating Terms Later:

If you update ToS:
1. Change `version` in `tosPanel.js` (e.g., "1.0" → "2.0")
2. Force re-acceptance by removing "ToS Accepted" role from all users
3. They must accept new version to regain access

---

## Optional: Enhanced Security

### Add State Blocking:

Prevent users from prohibited states (AZ, HI, IA, MS, MT, NV, SD):

**Add to ToS acceptance handler:**
```javascript
// In components/tosPanel.js, handleToSAcceptance function

// Ask for state during acceptance
const modal = new ModalBuilder()
  .setCustomId("tos_state_modal")
  .setTitle("State Verification");

const stateInput = new TextInputBuilder()
  .setCustomId("user_state")
  .setLabel("What state do you live in?")
  .setStyle(TextInputStyle.Short)
  .setRequired(true)
  .setMaxLength(2)
  .setPlaceholder("e.g., IL");

// Check if prohibited
const prohibitedStates = ["AZ", "HI", "IA", "MS", "MT", "NV", "SD"];
if (prohibitedStates.includes(userState.toUpperCase())) {
  return interaction.reply({
    content: "❌ Cash prize tournaments are prohibited in your state.",
    ephemeral: true
  });
}
```

---

## Example ToS Acceptance Message

When user clicks accept, they see:

```
✅ Terms of Service Accepted!

You now have access to all SkirmishBot services.
Your acceptance has been logged.

Welcome to SkirmishBot! 🎮
```

---

## Files Modified

**New Files:**
- `components/tosPanel.js` - ToS panel logic
- `models/ToSAcceptance.js` - Database logging model
- `TOS_ACCEPTANCE_SETUP.md` - This guide

**Modified Files:**
- `events/ready.js` - Initialize ToS panel on startup
- `events/InteractionCreate.js` - Handle accept button clicks

---

## Next Steps

1. ✅ Create `#tos-acceptance` channel
2. ✅ Copy channel ID
3. ✅ Update `TOS_CHANNEL_ID` in `tosPanel.js`
4. ✅ Update ToS link to your GitHub/website
5. ✅ Lock service channels to require "ToS Accepted" role
6. ✅ Restart bot
7. ✅ Test with alt account
8. ✅ Announce to users

---

**That's it!** You now have a legally compliant ToS acceptance system integrated with your rank verification.
