/**
 * Generic choice slots for `select` questions.
 *
 * iOS action buttons come from notification categories registered BEFORE the
 * push arrives, with fixed identifiers and fixed titles. A `select` question has
 * arbitrary choice ids and labels, so no static category can carry them.
 *
 * The fix is neutral slots: categories `iotpush_choice_<n>_<mask>` with actions
 * `choice_0`..`choice_<n-1>` titled "Option A".."Option D". The server picks the
 * category matching the choice count and destructive positions, puts the real
 * choice ids in `data.choice_slots`, and lists "A · <label>" in the body. On tap,
 * the app translates `choice_<i>` back to `choice_slots[i]` before reporting.
 *
 * `<mask>` is a bitmask of destructive positions (bit i = slot i renders red),
 * so every combination for 2..4 choices is pre-registered (28 categories).
 *
 * Keep in sync with iotpush server: src/lib/deliver.ts (choiceCategoryFor).
 */

export const CHOICE_ACTION_PREFIX = "choice_";
export const CHOICE_CATEGORY_PREFIX = "iotpush_choice_";
export const CHOICE_LETTERS = ["A", "B", "C", "D"] as const;
export const MIN_CHOICE_SLOTS = 2;
/** iOS renders up to 4 actions. Android shows at most 3 action buttons. */
export const MAX_CHOICE_SLOTS_IOS = 4;
export const MAX_CHOICE_SLOTS_ANDROID = 3;

export type ChoiceCategorySpec = {
  id: string;
  actions: Array<{
    identifier: string;
    buttonTitle: string;
    options: {
      opensAppToForeground: boolean;
      isDestructive: boolean;
      isAuthenticationRequired: boolean;
    };
  }>;
};

/** Every generic choice category the app should register at startup. */
export function buildChoiceCategories(maxSlots: number): ChoiceCategorySpec[] {
  const out: ChoiceCategorySpec[] = [];
  const cap = Math.min(maxSlots, CHOICE_LETTERS.length);
  for (let n = MIN_CHOICE_SLOTS; n <= cap; n++) {
    for (let mask = 0; mask < 1 << n; mask++) {
      out.push({
        id: `${CHOICE_CATEGORY_PREFIX}${n}_${mask}`,
        actions: Array.from({ length: n }, (_, i) => ({
          identifier: `${CHOICE_ACTION_PREFIX}${i}`,
          buttonTitle: `Option ${CHOICE_LETTERS[i]}`,
          options: {
            // Same as iotpush_approve_reject, which is known to work from the
            // lock screen: the tap is reported by the app's response handler.
            opensAppToForeground: true,
            isDestructive: ((mask >> i) & 1) === 1,
            isAuthenticationRequired: false,
          },
        })),
      });
    }
  }
  return out;
}

export type SlotResolution =
  | { kind: "not_a_slot"; actionId: string }
  | { kind: "resolved"; actionId: string }
  | { kind: "unresolvable"; slot: string };

/**
 * Translate a tapped action identifier into the id to report.
 *
 * - Anything that is not `choice_<digit>` passes through untouched.
 * - `choice_<i>` with a matching `choice_slots[i]` resolves to that choice id.
 * - `choice_<i>` without one is UNRESOLVABLE. It must never be reported as-is:
 *   the server would record "choice_0", an answer that is not one of the
 *   choices. The caller should tell the user the response was not sent.
 */
export function resolveChoiceSlot(
  actionIdentifier: string,
  choiceSlots: unknown
): SlotResolution {
  const m = /^choice_(\d)$/.exec(actionIdentifier);
  if (!m) return { kind: "not_a_slot", actionId: actionIdentifier };
  const idx = Number(m[1]);
  if (Array.isArray(choiceSlots)) {
    const id = choiceSlots[idx];
    if (typeof id === "string" && id.length > 0) return { kind: "resolved", actionId: id };
  }
  return { kind: "unresolvable", slot: actionIdentifier };
}
