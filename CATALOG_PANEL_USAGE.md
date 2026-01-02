# Prize Catalog Panel - User Guide

## What Changed

**OLD (Clunky):** Slash commands like `/prizes browse`, `/prizes search`, `/prizes view`

**NEW (Visual & Clean):** Persistent catalog panel with button navigation in channel `1456516444073234463`

---

## For Users: How to Browse Prizes

### 1. Go to the Catalog Channel
Navigate to the dedicated prize catalog channel (ID: `1456516444073234463`)

### 2. Browse the Catalog
The catalog panel shows:
- **Prize images** (main image from first prize)
- **3 prizes per page** with detailed info:
  - Name, point cost, stock status
  - Card condition, set, rarity
  - Featured badge (⭐) for highlighted items

### 3. Filter by Category
Use the **dropdown menu** at the top to filter:
- 🎁 All Prizes
- ⭐ Featured
- 🕰️ Vintage
- ✨ Modern
- 💎 Graded Cards
- 📦 Sealed Products
- 🌟 Ultra Rare
- 🎴 Bulk Lots

### 4. Navigate Pages
Use **◀️ Previous** and **Next ▶️** buttons to browse through pages

### 5. View Prize Details
Click **"View Prize #1/2/3"** to see full details in an ephemeral message (only you can see it):
- Full prize information
- Large image
- Your current points
- Whether you can afford it
- **Redeem** button

### 6. Redeem a Prize
1. Click **"🎁 Redeem This Prize"** button
2. Fill out shipping address form
3. Confirm
4. Points deducted, prize reserved!

### 7. Check Your Stats
Use the bottom buttons:
- **💰 My Points** - See your ticket and point balance
- **📦 My Redemptions** - View redemption history and tracking
- **🔄 Refresh** - Reload the catalog panel

---

## For Admins: Managing the Catalog

### Adding Prizes
```
/admin-prizes add
  name: Charizard Base Set Holo PSA 10
  description: 1st Edition Charizard graded PSA 10
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

**The catalog panel updates automatically when you add a prize!**

### Updating Images
1. Upload card image to any Discord channel
2. Right-click → **Copy Link**
3. Use this Discord CDN URL when adding/editing prizes

### Refreshing the Panel
```
/admin-prizes refresh-catalog
```

Use this if:
- Panel looks broken
- Stock/prices look outdated
- After making bulk changes

### Managing Redemptions
```
/admin-prizes pending          # View pending orders
/admin-prizes approve <id> [tracking]  # Approve and ship
/admin-prizes cancel <id> [reason]     # Cancel and refund
```

---

## Benefits of the New System

✅ **Always Visible** - Users don't need to remember slash commands
✅ **Visual** - See actual card images in the catalog
✅ **Clean Navigation** - Dropdown menus + pagination buttons
✅ **Professional Look** - Embeds with rich formatting
✅ **Less Typing** - Click buttons instead of typing commands
✅ **Mobile Friendly** - Works great on Discord mobile
✅ **No DM Spam** - Ephemeral messages for personal info
✅ **Auto-Updates** - Panel refreshes when you add prizes

---

## Flow Example

**User Experience:**
1. User opens catalog channel → Sees beautiful prize gallery
2. Clicks dropdown → Filters to "Graded Cards"
3. Browses pages → Finds PSA 10 Charizard
4. Clicks "View Prize #1" → Sees full details
5. Checks points (5000 needed, they have 4800) → Needs 200 more
6. Wins a T20 tournament → Earns 160 points
7. Returns to catalog → Now has 4960 points
8. Clicks "Redeem" → Fills shipping address
9. Clicks "My Redemptions" → Sees order is "pending"
10. Gets DM when shipped with tracking number → Happy customer!

**Admin Experience:**
1. Takes photo of Charizard card
2. Uploads to #card-images channel
3. Copies Discord CDN link
4. Runs `/admin-prizes add` with details
5. Catalog updates automatically → Card appears
6. User redeems it
7. Runs `/admin-prizes pending` → Sees order with shipping address
8. Ships card with tracking
9. Runs `/admin-prizes approve <id> <tracking>` → User notified
10. Done!

---

## Technical Details

**Channel ID:** `1456516444073234463`

**Panel Features:**
- Auto-refreshes on bot startup
- Persistent message (edits in-place)
- Shows top 3 prizes per page
- Category filtering via select menu
- Pagination with Previous/Next buttons
- Utility buttons (Points, Redemptions, Refresh)

**Button IDs:**
- `view_prize_{prizeId}` - View details
- `catalog_page_{page}` - Pagination
- `catalog_my_points` - Show balance
- `catalog_redemptions` - Show redemption history
- `catalog_refresh` - Refresh panel
- `catalog_category` - Select menu for categories

**Slash Commands (Still Available):**
- `/prizes browse/search/view/history` - Legacy commands still work
- `/balance` - Check tickets and points
- `/admin-prizes add/edit/remove/stock/pending/approve/cancel/refresh-catalog`

---

## Troubleshooting

**Panel not showing up:**
- Make sure channel ID `1456516444073234463` exists
- Restart bot (it creates panel on startup)
- Run `/admin-prizes refresh-catalog`

**Images not loading:**
- Use Discord CDN links (upload to Discord first)
- Make sure URL is publicly accessible
- Check URL ends in .jpg, .png, or .gif

**"View Prize" button disabled:**
- Prize is out of stock
- Check `/admin-prizes stock <prize-id> <quantity>` to add stock

**Catalog showing old data:**
- Click the **🔄 Refresh** button
- Or run `/admin-prizes refresh-catalog`

---

## Migration Notes

**Old slash commands still work** - Users can still use `/prizes browse` etc. if they prefer.

**Recommended:** Announce the new catalog channel to your users and encourage them to use the visual panel instead.

**Tip:** Pin the catalog message in the channel so it's always at the top!

---

Enjoy the new visual prize catalog system! 🎁
