// Offline grading. Closed exercises (cloze / translation / error-correction)
// match against the exercise's answer plus any accepted alternatives baked into
// the bank. Production ("write your own") returns null -> self-marked in the UI.

export function normalize(s = "") {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s，。？！、；："'‘’“”,.?!;:"']/g, "");
}

export function gradeClosed(ex, user) {
  const accepted = [ex.answer, ...(ex.accept || [])].map(normalize);
  return accepted.includes(normalize(user));
}

export const isProduction = (ex) => ex.type === "production";
