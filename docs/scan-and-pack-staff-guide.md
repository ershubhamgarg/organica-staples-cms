# Scan & Pack — Staff Guide

## What this is for

Before an order ships, you scan the QR code on every pack you're putting in
the box. The system checks each scan against what was actually ordered, so a
100 g pack can't accidentally go out for a 200 g order.

## Packing an order

1. Open the order in the CMS and click **Scan & Pack** (next to the status
   dropdown). Only orders that are Pending or Processing show this button.
2. If this is the first time this order has been opened for packing, click
   **Start Packing**. If someone already started it (or you're resuming after
   a break), it picks up right where it was left — nothing is lost.
3. **If you see "This order can't be packed yet"** — some item on the order
   doesn't have a SKU/QR set up yet. Tell whoever manages Manage SKUs; don't
   try to work around it by scanning a similar product's SKU.
4. For each pack you physically place in the box:
   - **Camera**: point it at the label's QR code. Once it registers, move the
     pack out of frame (or press **Scan Next Pack** if you see it) before
     scanning the next one — the camera won't double-count the same QR held
     in view.
   - **USB/Bluetooth scanner**: just scan — it types the SKU and presses
     Enter automatically, same as typing it in yourself.
   - **No scanner handy**: type the SKU into the box and press Enter.
5. Watch the big message that appears after every scan:
   - **Green with a checkmark** — counted. The item's progress updates.
   - **Red with an X** — not counted, and it tells you why: wrong pack size,
     already have enough of that one, that SKU isn't part of this order, or
     it's not a SKU the system recognizes at all. Fix the mistake and rescan
     the correct pack — nothing was changed by a rejected scan.
6. The **"X of Y packs verified"** bar at the top shows overall progress.
   Each line item also shows **Pending / Partial / Complete**.
7. Once every line reads Complete, **Complete Packing** becomes available.
   Click it. This is what marks the order ready to ship — no separate
   inventory or status step is needed.

## If you scan the wrong pack

Click **Undo Last Scan**, type a short reason (e.g. "scanned the wrong pack
by mistake"), and confirm. This only undoes the single most recent accepted
scan and is logged with your name and the time.

## If the order changes while you're mid-pack

If an admin edits the order or it gets cancelled while you have it open,
you'll see a banner saying the order changed. Click **Resync** — it updates
the required quantities to match the current order (adding, removing, or
adjusting lines as needed) without losing your scan history. If the order was
cancelled, packing simply can't continue.

## Reopening a completed order

If a completed order needs to be repacked (e.g. a customer changed
something after packing finished), click **Reopen** on that order's Scan &
Pack screen and give a reason. This is logged too.

## Sound and vibration

Use the **Sound on/off** button in the scanner panel to mute the beep if
you're in a shared space. On a phone/tablet, you'll also feel a short buzz on
every scan (success or rejection feel different) if your device supports it.

## A few things this system does NOT do

- It does not know if you actually put two *different* physical 100 g packs
  in the box versus scanning the same one twice — every pack of a given SKU
  has the identical QR code. Treat it as **scan, then immediately place that
  exact pack in the box**, one at a time, so the count stays honest.
- It doesn't buy a shipping label, book the courier pickup, or message the
  customer. Completing packing only marks the order ready — those other
  steps still happen the way they always have.
- It doesn't work offline. If the CMS can't reach the server, scans won't be
  counted (you'll see an error, not a false success).
