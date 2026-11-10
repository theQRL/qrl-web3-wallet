/** Removes leading and trailing NUL characters, as web3 1.x utf8ToHex did. */
export function stripNulEdges(value: string) {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === 0) start += 1;
  while (end > start && value.charCodeAt(end - 1) === 0) end -= 1;
  return value.slice(start, end);
}
