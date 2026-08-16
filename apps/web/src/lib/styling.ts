import type { SkinProfile } from "./api";

export function cleanDisplayText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/```(?:json|text|markdown)?/gi, "")
    .replace(/```/g, "")
    .replace(/#[0-9a-f]{3,8}\b/gi, "that shade")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleCase(value: string | null | undefined): string {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function profileGuidance(profile: SkinProfile) {
  const undertone = profile.undertone.toLowerCase();
  const depth = profile.depth.toLowerCase();
  const contrast = profile.contrast.toLowerCase();
  const redness = profile.concerns.find((concern) => concern.name.toLowerCase() === "redness")?.score ?? 40;
  const radiance = profile.concerns.find((concern) => concern.name.toLowerCase() === "radiance")?.score ?? 60;

  const colorLane = undertone === "warm"
    ? "olive, warm teal, terracotta, soft cream, and gold-leaning neutrals"
    : undertone === "cool"
      ? "navy, emerald, berry, blue-red, and silver-leaning neutrals"
      : "balanced jewel tones, softened neutrals, and both warm and cool accents";

  const contrastLane = contrast === "high"
    ? "You can carry clearer contrast and richer color without the garment taking over the face."
    : contrast === "low"
      ? "Tonal combinations and softened saturation will keep the look connected to your natural contrast."
      : "You have room to move between tonal dressing and a single stronger accent.";

  const framing = redness >= 60
    ? "When your complexion is showing more redness, start with calmer greens, blues, teals, and balanced neutrals near the face."
    : radiance <= 40
      ? "When your skin feels less radiant, clean mid-value color and a little saturation can bring energy back to the frame."
      : "Your visible skin signals are fairly flexible today, so use the garment’s mood and silhouette to lead the choice.";

  const depthNote = depth === "light"
    ? "Try light-to-mid depth colors first, then add darker pieces through contrast or accessories."
    : depth === "deep"
      ? "Deep, saturated colors and intentional pale contrast can both work; avoid letting washed neutrals flatten the look."
      : "Medium depth gives you a generous middle lane: use color intensity to decide how quiet or expressive the outfit feels.";

  return {
    colorLane,
    contrastLane,
    framing,
    depthNote,
    paletteLabel: `${titleCase(undertone)} · ${titleCase(depth)} · ${titleCase(contrast)} contrast`,
  };
}

