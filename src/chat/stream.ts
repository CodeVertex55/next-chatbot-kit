const EM_DASH = "\u2014";
const EN_DASH = "\u2013";
const WHITESPACE = /\s/;
const LINE_BREAK = /[\n\r\u2028\u2029]/;
const ENDERS = ".,;:!?";

/**
 * Rewrites dashes in streamed text. An en dash becomes a hyphen. An em dash and
 * the spaces or tabs around it become a comma and a space, but only when ordinary
 * text sits on both sides of it on the same line. Otherwise the dash is dropped
 * with no comma: at the start of the reply or of a line, before a line break, at
 * the end, or before one of . , ; : ! ?. A line break is never removed. State is
 * kept between chunks so the result does not depend on where the chunks were split.
 */
export function createPunctuationFilter(): { push(chunk: string): string; flush(): string } {
  // Spaces and tabs seen since the last emitted character. They are held back
  // because a dash that follows removes them.
  let pendingSpace = "";
  // The last emitted character. Empty at the start of the reply.
  let last = "";
  let dash = false;
  let dashAtLineStart = false;
  let spaced = false;

  function atLineStart(): boolean {
    return last === "" || LINE_BREAK.test(last);
  }

  return {
    push(chunk: string): string {
      let out = "";
      for (const char of chunk) {
        if (char === EM_DASH) {
          if (!dash) {
            dash = true;
            dashAtLineStart = atLineStart();
            spaced = pendingSpace !== "";
          }
          pendingSpace = "";
        } else if (WHITESPACE.test(char)) {
          if (LINE_BREAK.test(char)) {
            dash = false;
            out += pendingSpace + char;
            pendingSpace = "";
            last = char;
          } else if (dash) {
            spaced = true;
          } else {
            pendingSpace += char;
          }
        } else {
          let prefix = pendingSpace;
          pendingSpace = "";
          if (dash) {
            dash = false;
            if (!ENDERS.includes(char) && !dashAtLineStart) {
              prefix = ENDERS.includes(last) ? (spaced ? " " : "") : ", ";
            }
          }
          const text = char === EN_DASH ? "-" : char;
          out += prefix + text;
          last = text;
        }
      }
      return out;
    },

    flush(): string {
      const rest = pendingSpace;
      pendingSpace = "";
      last = "";
      dash = false;
      dashAtLineStart = false;
      spaced = false;
      return rest;
    },
  };
}
