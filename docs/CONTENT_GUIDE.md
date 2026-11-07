# Content guide

## Images (drawings and product photos)

- Format: JPEG, PNG, or WebP.
- Recommended size: 2000–3000 px on the longest edge.
- Color profile: sRGB.
- File size: under 5 MB per image works well.

## 3D models for ceramics

- Format: **GLB** (binary glTF 2.0).
- Keep models under 5 MB if possible; aim for 50k triangles or fewer.
- Bake materials and textures into the GLB.
- You do not need to center the model on the origin. The museum scales its longest
  side to about 1.4 m and stands it on the pedestal automatically.
- If you do not have a 3D model yet, just upload a photo as the cover image —
  the ceramic will still appear on the pedestal as a framed photo.

## Publishing flow

1. Sign in at `/admin`.
2. Open *Artworks* → *Add a new work*. Pick the category (drawing or ceramic),
   add a title, and save.
3. Open the new artwork's edit page and upload its cover image. If it's a
   ceramic, also upload its GLB model.
4. Set Status to **Published** and Save. The piece will immediately appear in
   the public collection and the 3D museum.

## Museum zones

The 3D museum has five zones: entrance lobby, drawing gallery, 3D crafting hall,
scan showcase, and export & AR room.

- **Zone text:** open *Admin → Zones*. Each zone has a *Map and direction-sign name*,
  a *Wall sign title*, and an optional *Wall sign subtitle*. Leave the subtitle empty
  to hide the second line. Zones you never save keep the built-in text.
- **Artwork placement:** on an artwork's edit page, pick a *Museum zone*. Drawings can go
  to the drawing gallery. Ceramics can go to the crafting hall or the scan showcase.
  Choose *Automatic* to use the default rule: drawings go to the drawing gallery, and
  ceramics go to the scan showcase if the slug starts with `scan-`, otherwise the
  crafting hall. Lobby and export room show no artworks.

## Inquiry flow

1. Visitors submit a question or purchase interest via the *Inquire* page.
2. Inquiries appear under *Admin → Inquiries*.
3. Use the status dropdown to track them through *New → Contacted → Invoice
   Sent → Sold / Closed*.
4. To accept payment, paste a PayPal payment link or invoice URL into the
   artwork's *PayPal link* field; a *Pay with PayPal* button will then appear
   on its public page.
