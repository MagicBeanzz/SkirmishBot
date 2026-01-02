# Prize Catalog System - Quick Start Guide

## Overview

Your bot has been transformed from a cash prize system to a **prize redemption platform** (like Dave & Busters). This is **much safer legally** - users can't cash out, they redeem physical prizes instead.

## How It Works Now

1. **Users buy tickets** ($) → Enter tournaments
2. **Win tournaments** → Earn prize points
3. **Redeem points** → Get Pokemon cards shipped to them

**No cash-out = No gambling license needed!**

---

## For Users: Available Commands

### `/prizes browse [category]`
Browse the prize catalog with pagination and category filters.

Categories:
- `vintage` - Vintage Pokemon cards
- `modern` - Modern sets
- `graded` - PSA/BGS graded cards
- `sealed` - Booster boxes, ETBs, etc.
- `ultra-rare` - Chase cards
- `bulk` - Bulk lots
- `other` - Misc items

### `/prizes search <query>`
Search for specific prizes by name, description, or card set.

### `/prizes view <prize-id>`
View detailed info about a prize (image, points, stock, condition, etc.)
- Click "Redeem Prize" button to purchase
- Fills out shipping address modal
- Deducts points, creates redemption

### `/prizes history`
View your redemption history and status.

### `/balance`
Check your tickets and prize points.

---

## For Admins: Managing the Catalog

### 📸 **UPLOADING IMAGES FOR PRIZES**

**Option 1: Discord CDN (Recommended - Free)**
1. Upload the card image to a Discord channel (any channel on your server)
2. Right-click the image → Copy Link
3. Use this link as the `image-url` when adding prizes
4. Discord hosts it permanently for free!

**Option 2: External Image Host**
- Use Imgur, Cloudinary, or any image hosting service
- Make sure the URL ends in `.jpg`, `.png`, or `.gif`
- Must be publicly accessible (no login required)

**Example Discord CDN URL:**
```
https://cdn.discordapp.com/attachments/1234567890/1234567890/charizard.png
```

---

### `/admin-prizes add`
Add a new prize to the catalog.

**Required Fields:**
- `name` - Prize name (e.g., "Charizard Base Set Holo")
- `description` - Detailed description
- `image-url` - Image URL (see above)
- `points` - Point cost (e.g., 100)
- `stock` - Quantity available (e.g., 1)
- `category` - Choose from dropdown

**Optional Fields:**
- `featured` - Show in featured section (true/false)
- `card-set` - Pokemon set name (e.g., "Base Set")
- `card-number` - Card number (e.g., "4/102")
- `condition` - Condition (e.g., "PSA 10", "Near Mint")
- `rarity` - Rarity (e.g., "Holo Rare", "Secret Rare")

**Example:**
```
/admin-prizes add
  name: Charizard Base Set Holo PSA 10
  description: 1st Edition Charizard from Base Set, graded PSA 10 GEM MINT
  image-url: https://cdn.discordapp.com/attachments/.../charizard.png
  points: 5000
  stock: 1
  category: graded
  featured: true
  card-set: Base Set
  card-number: 4/102
  condition: PSA 10
  rarity: Holo Rare
```

---

### `/admin-prizes edit <prize-id> <field> <value>`
Edit an existing prize.

Editable fields:
- `name`, `description`, `imageUrl`
- `pointCost`, `stock`
- `category`, `featured`, `active`

**Example:**
```
/admin-prizes edit
  prize-id: 507f1f77bcf86cd799439011
  field: stock
  value: 5
```

---

### `/admin-prizes stock <prize-id> <quantity>`
Quick way to update stock quantity.

---

### `/admin-prizes remove <prize-id>`
Delete a prize from the catalog (permanent).

---

### `/admin-prizes pending`
View all pending redemptions waiting to be shipped.

Shows:
- Prize name & point cost
- User's Discord mention
- Full shipping address
- Redemption ID
- When it was requested

---

### `/admin-prizes approve <redemption-id> [tracking]`
Approve a redemption and mark as shipped.

**What it does:**
- Updates status to "shipped"
- Records who approved it (you)
- Sends DM to user with tracking (if provided)
- Logs timestamp

**Example:**
```
/admin-prizes approve
  redemption-id: 507f1f77bcf86cd799439011
  tracking: 1Z999AA10123456784
```

---

### `/admin-prizes cancel <redemption-id> [reason]`
Cancel a redemption and refund points.

**What it does:**
- Refunds points to user
- Restores stock to prize
- Updates status to "cancelled"
- Sends DM to user with reason

Use this if:
- Item is out of stock
- Shipping address is invalid
- Prize was damaged

---

## Workflow Example

### 1. Adding Pokemon Cards to Catalog

**For your $30k collection:**

1. Take clear photos of each card
2. Upload to a dedicated Discord channel (like `#card-images`)
3. For each card, run `/admin-prizes add` with:
   - Point costs based on card value
   - Stock quantity (1 for singles, more for bulk)
   - Appropriate category
   - Card details (set, number, condition, rarity)

**Suggested Point Costs:**
- $10 card = 100 points
- $50 card = 500 points
- $100 card = 1000 points
- $500 card = 5000 points

**Example Tournament Prizes:**
- T1 tournament (4 players × 1 ticket) = Winner gets 4 points
- T5 tournament (4 players × 5 tickets) = Winner gets 20 points
- T10 tournament (8 players × 10 tickets) = Winner gets 80 points
- T20 tournament (8 players × 20 tickets) = Winner gets 160 points

---

### 2. Handling Redemptions

**When a user redeems a prize:**

1. They fill out shipping address modal
2. Points are deducted automatically
3. Stock is decreased automatically
4. Redemption appears in `/admin-prizes pending`

**Your job:**
1. Run `/admin-prizes pending` daily
2. Package and ship the card
3. Run `/admin-prizes approve <redemption-id> <tracking>`
4. User gets notified automatically!

---

## Point Economics

### Current Tournament Payouts (100% to winner):
- **T1 (4p)**: 4 points
- **T1 (8p)**: 8 points
- **T5 (4p)**: 20 points
- **T5 (8p)**: 40 points
- **T10 (4p)**: 40 points
- **T10 (8p)**: 80 points
- **T20 (4p)**: 80 points
- **T20 (8p)**: 160 points

### Suggested Prize Tiers

**Low Tier (Under 50 points):**
- Bulk commons/uncommons
- Single booster packs
- Sleeves, playmats

**Mid Tier (50-200 points):**
- Modern holos
- Sealed products (ETBs)
- Popular non-chase cards

**High Tier (200-1000 points):**
- Vintage holos
- Modern chase cards
- Graded cards (PSA 8-9)

**Ultra Tier (1000+ points):**
- 1st Edition holos
- PSA 10 graded
- Sealed vintage boxes
- Trophy cards

---

## Database Models

### Prize Schema
```javascript
{
  name: String,
  description: String,
  imageUrl: String,
  pointCost: Number,
  stock: Number,
  category: String, // vintage|modern|graded|sealed|ultra-rare|bulk|other
  featured: Boolean,
  active: Boolean,

  // Pokemon-specific
  cardSet: String,
  cardNumber: String,
  condition: String,
  rarity: String,

  notes: String // admin notes
}
```

### Redemption Schema
```javascript
{
  userId: String,
  serverId: String,
  prizeId: ObjectId,
  prizeName: String,
  pointCost: Number,

  status: String, // pending|approved|shipped|delivered|cancelled

  shippingAddress: {
    fullName: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    phone: String
  },

  trackingNumber: String,
  shippedAt: Date,
  deliveredAt: Date,

  adminNotes: String,
  processedBy: String
}
```

### Profile Schema (Updated)
```javascript
{
  userId: String,
  serverId: String,
  balance: Number,  // Tickets (for entering tournaments)
  points: Number    // Prize points (for redeeming prizes) [CHANGED FROM winningsBalance]
}
```

---

## Legal Considerations

### ✅ What You're Doing Now (Safe):
- Selling **tickets for tournament entry** (entertainment service)
- Awarding **non-cash prizes** to winners
- Operating a **skill-based competition with merchandise rewards**
- Similar to arcade redemption games, Chuck E. Cheese, etc.

### ❌ What You Removed (Risky):
- Cash payouts
- Money transmitter functionality
- Real-money gambling

### Best Practices:
1. **Terms of Service**: Add clause that prizes have no guaranteed cash value
2. **Age Gate**: Consider 13+ or 18+ requirement
3. **No Guaranteed Value**: Don't advertise "This card is worth $500"
4. **Skill-Based**: Emphasize tournaments are skill-based, not chance
5. **No Secondary Market**: Discourage selling/trading prizes between users
6. **Prize Variety**: Mix of high/low value items (not just expensive cards)

---

## Next Steps

1. **Create a card image channel** in your Discord
2. **Upload photos of your Pokemon cards**
3. **Run `/admin-prizes add`** for each card
4. **Set featured prizes** to highlight the best cards
5. **Test the system** - redeem a prize yourself to see the flow
6. **Deploy commands** - Run `node deploy-commands.js` to register new commands
7. **Announce to users** - Let them know about the new prize catalog!

---

## Tips for Managing Your Catalog

### Organization Tips:
- **Start with featured items** - Add your best 10-20 cards first
- **Use clear naming** - "Charizard Base Set Holo PSA 10" not just "Charizard"
- **High-quality images** - Clear photos showing card condition
- **Accurate descriptions** - Mention any flaws, centering issues, etc.
- **Category consistency** - Use categories logically
- **Stock management** - Update stock as you add/remove cards from collection

### Pricing Strategy:
- **Don't overprice** - Make prizes achievable (few tournaments should earn a prize)
- **Tier variety** - Mix of cheap and expensive items
- **Featured rotation** - Change featured items weekly to keep interest
- **Bulk options** - Offer 50-card lots for smaller point amounts
- **Sealed products** - Booster packs are great low-tier prizes

---

## Troubleshooting

**"Prize not showing up"**
- Make sure `active: true`
- Check spelling in category name
- Try `/prizes search <name>` to find it

**"Can't upload image"**
- Image must be publicly accessible
- Discord CDN links work best
- Make sure URL ends in image extension

**"Points not deducted"**
- Check user has enough points with `/checkbalance @user`
- Make sure prize is in stock
- Check redemption with `/admin-prizes pending`

**"User didn't receive prize"**
- Make sure you ran `/admin-prizes approve`
- Check their DMs aren't closed
- Verify tracking number is correct

---

## Questions?

This system gives you:
- ✅ Legal safety (no cash gambling)
- ✅ Automated prize management
- ✅ Discord-native UX
- ✅ Physical fulfillment tracking
- ✅ User engagement (collecting points)
- ✅ Monetization (ticket sales still work)

You're good to go! Start adding your Pokemon cards to the catalog and let your users compete for real prizes! 🎁
