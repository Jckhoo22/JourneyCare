/**
 * Prompts for the AI intake feature. [T21, AI3, ODO2]
 *
 * These are the STRINGS the model sees, kept in one place so:
 * (a) Shirley's AI Studio gate (T21) tests the same prompts the app
 *     eventually ships, byte-for-byte;
 * (b) T22 (receipt scan) and T23 (odometer snap) call the model with
 *     the identical text — the whole gate premise is that the prompts
 *     Shirley signed off on ARE the shipped prompts.
 *
 * The prompts are language-agnostic: the model is told the answer must
 * be JSON with English preset ids, regardless of what the receipt is
 * written in. This is what lets a Malay-language receipt still return
 * `"type": "engine_oil"` — the preset id is a stable key, not a
 * translation. See maintenance-types.json.
 */

/**
 * The receipt-scan prompt. [AI3]
 *
 * The list of preset ids is baked into the prompt string so a change in
 * `maintenance-types.json` doesn't need this file to also change — as
 * long as the ids stay stable (they're permanent, per CLAUDE.md's data
 * section). Adding a new preset needs a prompt update here AND a
 * re-run of T21.
 */
export const RECEIPT_PROMPT = `You are an assistant reading a maintenance receipt for a car in Malaysia.
Return facts as JSON only — no prose, no explanation, no markdown fences.
The JSON must match exactly this shape:

{
  "date": "YYYY-MM-DD" | null,
  "odometer": number | null,
  "workshop": string | null,
  "items": [
    {
      "type": "<one of the ids below | \\"other\\">",
      "rawText": "<the exact line item text from the receipt>",
      "cost": number,
      "confidence": "high" | "low"
    }
  ]
}

Valid \`type\` ids (from maintenance-types.json):
  engine_oil, oil_filter, air_filter, cabin_filter, fuel_filter,
  brake_pads, brake_fluid, brake_disc, coolant, spark_plug,
  timing_belt, transmission_fluid, tyre, wiper_blades, battery,
  wheel_alignment, tyre_rotation, aircon_service, inspection, custom

Rules:
- Use "other" only when nothing matches — do NOT guess a similar one.
- \`cost\` is in Malaysian Ringgit as a number (e.g. 250.5 for RM 250.50).
- \`date\` follows the receipt's date, converted to YYYY-MM-DD.
- \`odometer\` is the car's reading at service, in kilometres, if visible.
- \`confidence: "low"\` when the line is ambiguous, hand-written, or the
  cost is unclear.
- Return an empty items list if no maintenance items are visible.

The receipt image will be provided as the next input. Return only valid JSON.`;

/**
 * The odometer-snap prompt. [ODO2]
 *
 * The trip-meter exclusion is stated explicitly because it is the single
 * most common misread — trip meters are physically smaller, share the
 * same visual grammar, and often show one decimal place. A model that
 * confuses them adds thousands of km to the car in one save.
 */
export const ODOMETER_PROMPT = `You are reading a car's odometer from a dashboard photo. Return JSON only.
Shape:

{ "odometer": number, "confidence": "high" | "low" }

Rules:
- Read the MAIN odometer only. Ignore trip meters (usually smaller,
  labelled TRIP A / TRIP B, and often show one decimal place).
- Return the number in kilometres, as an integer.
- Confidence "low" when the reading is partly obscured, sun-flared,
  or two digits are ambiguous.
- If you cannot read the main odometer at all, return
  { "odometer": 0, "confidence": "low" }.

The dashboard image will be provided as the next input. Return only valid JSON.`;
