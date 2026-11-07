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
- You do not need to center the model on the origin. The museum scales it to fit
  a small display area and stands it on the pedestal automatically.
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

## Inquiry flow

1. Visitors submit a question or purchase interest via the *Inquire* page.
2. Inquiries appear under *Admin → Inquiries*.
3. Use the status dropdown to track them through *New → Contacted → Invoice
   Sent → Sold / Closed*.
4. To accept payment, paste a PayPal payment link or invoice URL into the
   artwork's *PayPal link* field; a *Pay with PayPal* button will then appear
   on its public page.
