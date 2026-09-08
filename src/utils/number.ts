// For a controlled numeric <input>, always rendering the literal 0 (or a
// coalesced default like `?? 0`) means the field can never actually go
// blank while editing — clearing it just snaps back to "0", so typing a
// fresh value like "799" next to that stuck "0" produces "0799". Treating
// 0/null/undefined as an empty string lets the field go genuinely blank.
export function displayNumber(value: number | null | undefined): number | string {
  return value ? value : "";
}

export function parseNumberInput(raw: string): number {
  return raw === "" ? 0 : Number(raw);
}
